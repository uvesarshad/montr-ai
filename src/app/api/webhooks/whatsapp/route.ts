import { NextRequest, NextResponse } from 'next/server';
import { whatsappService } from '@/lib/services/whatsapp.service';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { autoReplyService } from '@/lib/services/auto-reply.service';
import { parseWebhookBody, verifyWhatsAppSignature } from '@/lib/whatsapp/webhook-verify';
import WhatsAppConversation from '@/lib/db/models/whatsapp-conversation.model';
import { resolveContact } from '@/lib/identity';
import { resumePausedExecutionsForChannelMessage } from '@/lib/workflow/resume-channel';
import { publishDomainEvent } from '@/lib/events/domain-bus';

// Verify Webhook (GET)
export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    // Check if mode and token exist
    if (mode && token) {
        // Check if mode and token are correct
        if (mode === 'subscribe') {
            // In a real multi-tenant app, we might need a more dynamic way to verify tokens.
            // However, for Meta webhooks, we typically configure *one* webhook URL for the App.
            // Use a global env var for the verification token, OR check against any active account.
            // Simple approach: Use a shared secret for the App verification.

            const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

            if (token === expectedToken) {
                console.log('WEBHOOK_VERIFIED');
                return new NextResponse(challenge, { status: 200 });
            } else {
                return new NextResponse('Forbidden', { status: 403 });
            }
        }
    }

    return new NextResponse('BadRequest', { status: 400 });
}

// Handle Events (POST)
export async function POST(req: NextRequest) {
    try {
        const rawBody = await req.text();
        const signature = req.headers.get('x-hub-signature-256');

        if (!verifyWhatsAppSignature(rawBody, signature)) {
            return new NextResponse('Invalid signature', { status: 403 });
        }

        const body = parseWebhookBody(rawBody);

        // Cast to a structured type for safe property access
        type WaEntry = {
            changes?: Array<{
                value?: {
                    messages?: Array<{ id?: string; from?: string; text?: { body?: string } }>;
                    statuses?: Array<{ id?: string; status?: string }>;
                    metadata?: { phone_number_id?: string };
                };
            }>;
        };
        type WaBody = { object?: string; entry?: WaEntry[] };
        const wb = body as WaBody;

        console.log('WHATSAPP_WEBHOOK_RECEIVED', JSON.stringify(body, null, 2));

        // Check if it's a WhatsApp status update
        if (wb.object) {
            if (wb.entry &&
                wb.entry[0].changes &&
                wb.entry[0].changes[0] &&
                wb.entry[0].changes[0].value?.messages &&
                wb.entry[0].changes[0].value.messages[0]
            ) {
                const phoneNumberId = String(wb.entry[0].changes[0].value.metadata?.phone_number_id || '');
                const from = String(wb.entry[0].changes[0].value.messages[0].from || '');
                const msgBody = wb.entry[0].changes[0].value.messages[0].text
                    ? String(wb.entry[0].changes[0].value.messages[0].text.body || '')
                    : '';

                // Find the account associated with this phone number ID
                const account = await whatsappAccountRepository.findByPhoneNumberId(phoneNumberId);

                if (account) {
                    // Agent control channel (G12 2026-06-05): if this phone is
                    // paired (or pairing) as an owner control phone, handle the
                    // command and stop — control traffic must never create CRM
                    // contacts/activities or reach bots/keyword replies.
                    try {
                        const { handleControlMessage } = await import('@/lib/agent/control-channel');
                        const handled = await handleControlMessage({ account, from, text: msgBody });
                        if (handled) {
                            return new NextResponse('EVENT_RECEIVED', { status: 200 });
                        }
                    } catch (controlError) {
                        console.error('[whatsapp-webhook] control-channel check failed:', controlError);
                    }

                    // Process the message (create activity, contact, etc.)
                    await whatsappService.processIncomingMessage(account, body as unknown as Parameters<typeof whatsappService.processIncomingMessage>[1]);

                    // Routing priority (B3-4.5.5):
                    //   1. Conversation assigned to a human → suppress all bots (B3-4.5.7).
                    //   2. Account.aiBotId set → run AI bot pipeline.
                    //   3. Else → fall back to keyword auto-reply.
                    let humanAssigned = false;
                    let resolvedContactId: string | null = null;
                    let conversationId: string | null = null;
                    try {
                        const resolution = await resolveContact({
                            phone: from,
                            createIfMissing: false,
                        });
                        if (resolution.contact) {
                            resolvedContactId = String(resolution.contact._id);
                            const convo = await WhatsAppConversation.findOne({
                                accountId: account._id,
                                contactId: resolution.contact._id,
                            }).select('_id assignedToId').lean().exec() as { _id: unknown; assignedToId?: unknown } | null;
                            humanAssigned = !!convo?.assignedToId;
                            if (convo) {
                                conversationId = String(convo._id);
                            }

                            // Resume any workflow paused on wait_for_channel_response
                            // for this contact + whatsapp channel (B3-15 / smoke).
                            void resumePausedExecutionsForChannelMessage({
                                channel: 'whatsapp',
                                contactId: resolvedContactId,
                                message: {
                                    messageId: String(wb.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ?? ''),
                                    content: msgBody,
                                    direction: 'inbound',
                                },
                            }).catch(err => console.error('[whatsapp-webhook] channel-resume failed:', err));
                        }
                    } catch (err) {
                        console.error('[whatsapp-webhook] handoff check failed:', err);
                    }

                    // Phase 2 (2026-06-05): inbound-channel event for agent
                    // mission triggers. Carries ownership so triggered
                    // missions can avoid double-handling bot/human threads.
                    try {
                        publishDomainEvent({
                            type: 'whatsapp.message_received',
                            brandId: account.brandId ? String(account.brandId) : undefined,
                            source: 'whatsapp.webhook',
                            payload: {
                                from,
                                contactId: resolvedContactId,
                                conversationId,
                                humanAssigned,
                                botHandled: !!account.aiBotId,
                                preview: msgBody.slice(0, 200),
                            },
                        });
                    } catch (err) {
                        console.error('[whatsapp-webhook] domain event publish failed:', err);
                    }

                    const botId = account.aiBotId ? String(account.aiBotId) : null;

                    if (!humanAssigned && botId && resolvedContactId && conversationId) {
                        try {
                            const { runAiBotTurn } = await import('@/lib/ai-bots/runtime');
                            const { createWhatsAppSender } = await import('@/lib/ai-bots/senders/whatsapp-sender');
                            const sender = createWhatsAppSender({
                                account,
                                toPhone: from,
                                conversationId,
                                aiBotId: botId,
                            });
                            const result = await runAiBotTurn({
                                botId,
                                channel: 'whatsapp',
                                conversationId,
                                brandId: account.brandId ? String(account.brandId) : null,
                                contactId: resolvedContactId,
                                inboundMessage: msgBody,
                                sender,
                            });
                            console.log(`[ai-bot] WhatsApp turn handled (botId=${botId}, escalated=${result.escalationRequested})`);
                        } catch (err) {
                            console.error('[ai-bot] WhatsApp turn failed; falling back to keyword auto-reply:', err);
                            await runKeywordAutoReply(account, from, msgBody);
                        }
                    } else if (!humanAssigned) {
                        await runKeywordAutoReply(account, from, msgBody);
                    }

                    console.log(`Processed message from ${from} for account ${account.name}`);
                } else {
                    console.warn(`No account found for phoneNumberId: ${phoneNumberId}`);
                }

            }

            // Handle status updates
            if (wb.entry &&
                wb.entry[0].changes &&
                wb.entry[0].changes[0] &&
                wb.entry[0].changes[0].value?.statuses &&
                wb.entry[0].changes[0].value.statuses[0]
            ) {
                const status = wb.entry[0].changes[0].value.statuses[0];
                const phoneNumberId = String(wb.entry[0].changes[0].value.metadata?.phone_number_id || '');

                // Find the account associated with this phone number ID
                const account = await whatsappAccountRepository.findByPhoneNumberId(phoneNumberId);

                if (account) {
                    // Process the status update
                    await whatsappService.processStatusUpdate(account, { id: String(status.id || ''), status: String(status.status || '') });
                    console.log(`Processed status update: ${status.status} for message ${status.id}`);
                } else {
                    console.warn(`No account found for phoneNumberId: ${phoneNumberId}`);
                }
            }

            return new NextResponse('EVENT_RECEIVED', { status: 200 });
        }

        return new NextResponse('NotFound', { status: 404 });
    } catch (error) {
        console.error('Error processing webhook:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

// Fallback when no AI bot is assigned to the account: the legacy per-account
// keyword auto-reply path. Kept as a back-compat surface so existing rules
// still fire (B3-4.5.5 migration F.1).
async function runKeywordAutoReply(
    account: Parameters<typeof whatsappService.sendMessage>[0],
    from: string,
    msgBody: string,
): Promise<void> {
    try {
        const matchingReply = await autoReplyService.findMatchingReply(
            account._id.toString(),
            msgBody,
        );
        if (!matchingReply) return;

        if (matchingReply.response.type === 'text') {
            await whatsappService.sendMessage(account, {
                messaging_product: 'whatsapp',
                to: from,
                type: 'text',
                text: { body: matchingReply.response.content },
            });
        } else if (matchingReply.response.type === 'template') {
            await whatsappService.sendTemplateMessage(
                account,
                from,
                matchingReply.response.content,
                matchingReply.response.templateLanguage || 'en',
            );
        }
        console.log(`Sent auto-reply: ${matchingReply.name}`);
    } catch (err) {
        console.error('[whatsapp-webhook] keyword auto-reply failed:', err);
    }
}
