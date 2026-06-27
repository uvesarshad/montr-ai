import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

// Minimal local shapes for the mailparser values we actually read. The
// @types/mailparser package exposes these via a namespace import that
// conflicts with our require()-style usage of `imap`, so we mirror the slice
// we need here.
type ParsedAddressEntry = { address?: string; name?: string };
type ParsedAddressObject = { value?: ParsedAddressEntry[] };
type AnyAddress = ParsedAddressObject | ParsedAddressObject[] | undefined;
import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { blocklistRepository } from '@/lib/db/repository/crm/blocklist.repository';
import { resolveOrCreateContactForSender } from './contact-auto-create';
import { notifyInboundEmail } from './inbound-trigger';
import { SendEmailOptions, SendEmailResult } from './index';

/**
 * IMAP / SMTP sync for generic email providers.
 *
 * Per-sync caps:
 *   - At most `MAX_MESSAGES_PER_FOLDER` messages fetched per folder.
 *   - Honors `account.syncStartDate` / `account.lastSyncAt` so each pass only
 *     fetches new mail.
 *   - Skips messages whose `Message-ID` is already stored.
 *
 * Auto-linking: if `account.autoLinkContacts` is true, the sender's email is
 * looked up against the org's contacts; the resulting contactId is attached
 * to the stored email record.
 */
const MAX_MESSAGES_PER_FOLDER = 250;

type ImapClient = InstanceType<typeof Imap>;

function buildImapClient(account: ICrmEmailAccount): ImapClient {
    if (!account.imap) {
        throw new Error('IMAP configuration not found');
    }
    return new Imap({
        user: account.imap.username,
        password: account.imap.password,
        host: account.imap.host,
        port: account.imap.port,
        tls: account.imap.secure,
        // Keep TLS strict by default so a hostile MITM can't downgrade.
        tlsOptions: { rejectUnauthorized: true, servername: account.imap.host },
        authTimeout: 15_000,
        connTimeout: 15_000,
    });
}

function connectImap(imap: ImapClient): Promise<void> {
    return new Promise((resolve, reject) => {
        const onError = (err: Error) => {
            imap.removeListener('ready', onReady);
            reject(err);
        };
        const onReady = () => {
            imap.removeListener('error', onError);
            resolve();
        };
        imap.once('ready', onReady);
        imap.once('error', onError);
        imap.connect();
    });
}

function openBox(imap: ImapClient, folder: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        imap.openBox(folder, true, (err: Error | null, box: unknown) => {
            if (err) reject(err);
            else resolve(box);
        });
    });
}

function searchUids(
    imap: ImapClient,
    criteria: (string | (string | Date)[])[],
): Promise<number[]> {
    return new Promise((resolve, reject) => {
        imap.search(criteria, (err: Error | null, uids: number[]) => {
            if (err) reject(err);
            else resolve(uids || []);
        });
    });
}

function fetchByUid(imap: ImapClient, uid: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const fetcher = imap.fetch(uid, { bodies: '' });
        const chunks: Buffer[] = [];
        fetcher.on('message', (msg: { on: (event: string, cb: (...args: unknown[]) => void) => void; once: (event: string, cb: (err: Error) => void) => void }) => {
            msg.on('body', ((stream: { on: (event: string, cb: (chunk: Buffer) => void) => void }) => {
                stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            }) as (...args: unknown[]) => void);
            msg.once('error', reject);
        });
        fetcher.once('error', reject);
        fetcher.once('end', () => resolve(Buffer.concat(chunks)));
    });
}

function addressObjectToList(addr: AnyAddress) {
    if (!addr) return [];
    const items = Array.isArray(addr) ? addr : [addr];
    return items
        .flatMap((entry) =>
            (entry.value || []).map((v) => ({
                email: (v.address || '').toLowerCase(),
                name: v.name || undefined,
            })),
        )
        .filter((a) => !!a.email);
}

/**
 * Sync IMAP account emails. Connects, walks each configured folder, parses
 * messages newer than the last sync, and stores them. Updates the account's
 * sync state at the end.
 */
export async function syncImapAccount(account: ICrmEmailAccount): Promise<void> {
    if (!account.imap) {
        throw new Error('IMAP configuration not found');
    }

    console.log(`[IMAP Sync] Starting sync for account: ${account.email}`);

    const sinceDate = account.lastSyncAt || account.syncStartDate;
    const folders =
        account.syncFolders && account.syncFolders.length > 0 ? account.syncFolders : ['INBOX'];

    const imap = buildImapClient(account);
    let syncedCount = 0;

    try {
        await connectImap(imap);

        for (const folder of folders) {
            try {
                await openBox(imap, folder);
                const criteria: (string | (string | Date)[])[] = sinceDate
                    ? [['SINCE', sinceDate]]
                    : ['ALL'];
                const uids = await searchUids(imap, criteria);
                // Newest first; cap per folder to bound a single sync's work.
                const targetUids = uids.slice(-MAX_MESSAGES_PER_FOLDER).reverse();

                for (const uid of targetUids) {
                    try {
                        const raw = await fetchByUid(imap, uid);
                        const parsed = await simpleParser(raw);

                        const messageId = parsed.messageId;
                        if (!messageId) {
                            // Without a message-id we can't dedupe; skip.
                            continue;
                        }

                        // Skip if already stored.
                        const existing = await emailRepository.findByMessageId(
                            account._id.toString(),
                            messageId,
                        );
                        if (existing) continue;

                        const fromList = addressObjectToList(parsed.from);
                        const toList = addressObjectToList(parsed.to);
                        const ccList = addressObjectToList(parsed.cc);
                        const fromEmail = fromList[0]?.email;
                        const direction = folder.toLowerCase().includes('sent') ? 'outbound' : 'inbound';

                        // Resolve / auto-create the linked contact for the sender.
                        // Blocked senders are stored but never linked or auto-created.
                        let contactId: string | undefined;
                        const blocked = fromEmail
                            ? await blocklistRepository.isBlocked(
                                  fromEmail,
                              )
                            : false;
                        if (!blocked && direction === 'inbound') {
                            const resolved = await resolveOrCreateContactForSender(
                                account,
                                fromList[0],
                            );
                            contactId = resolved ?? undefined;
                        } else if (!blocked && account.autoLinkContacts && fromEmail) {
                            contactId = await findContactByEmail(
                                fromEmail,
                            );
                        }

                        const references = Array.isArray(parsed.references)
                            ? parsed.references
                            : parsed.references
                                ? [parsed.references]
                                : [];

                        const createdEmail = await emailRepository.create({
                            accountId: account._id.toString(),
                            messageId,
                            threadId: references[0],
                            from: fromList[0] || { email: account.email },
                            to: toList,
                            cc: ccList,
                            replyTo: parsed.replyTo
                                ? addressObjectToList(parsed.replyTo)[0]?.email
                                : undefined,
                            inReplyTo: parsed.inReplyTo,
                            references,
                            subject: parsed.subject,
                            bodyHtml: typeof parsed.html === 'string' ? parsed.html : undefined,
                            bodyText: parsed.text,
                            snippet: (parsed.text || '').slice(0, 200),
                            date: parsed.date || new Date(),
                            folder,
                            isRead: false,
                            direction,
                            contactId,
                            hasAttachments: (parsed.attachments || []).length > 0,
                            attachments: (parsed.attachments || []).map((att: { contentId?: string; filename?: string; contentType?: string; size?: number }, idx: number) => ({
                                attachmentId: att.contentId || `imap-${uid}-${idx}`,
                                fileName: att.filename || `attachment-${idx}`,
                                mimeType: att.contentType || 'application/octet-stream',
                                size: att.size || 0,
                            })),
                        });

                        // Drive automation off newly-stored inbound mail:
                        // email_received trigger + email wait-for-reply resume.
                        if (direction === 'inbound') {
                            await notifyInboundEmail({
                                account,
                                emailId: String((createdEmail as { _id?: unknown })?._id ?? messageId),
                                messageId,
                                contactId,
                                fromEmail,
                                subject: parsed.subject,
                                snippet: (parsed.text || '').slice(0, 200),
                            }).catch(() => { /* best-effort — logged inside */ });
                        }

                        syncedCount++;
                    } catch (msgError) {
                        console.error(`[IMAP Sync] Failed to ingest UID ${uid} in ${folder}:`, msgError);
                    }
                }
            } catch (folderError) {
                // A missing or unauthorized folder shouldn't abort the whole sync.
                console.error(`[IMAP Sync] Folder "${folder}" failed:`, folderError);
            }
        }

        await emailAccountRepository.updateSyncState(account._id.toString(), {
            lastSyncAt: new Date(),
            lastSyncError: undefined,
            totalEmailsSynced: (account.totalEmailsSynced || 0) + syncedCount,
        });

        console.log(`[IMAP Sync] Done — synced ${syncedCount} new messages for ${account.email}`);
    } catch (error) {
        console.error(`[IMAP Sync] Error syncing account ${account.email}:`, error);

        await emailAccountRepository.updateSyncState(account._id.toString(), {
            lastSyncAt: new Date(),
            lastSyncError: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
    } finally {
        try {
            imap.end();
        } catch {
            // ignore
        }
    }
}

/**
 * Send via the account's SMTP config using nodemailer. Stores a `direction:
 * outbound` record with `folder: 'sent'` so the conversation thread shows the
 * outgoing message alongside incoming replies.
 */
export async function sendImapEmail(
    account: ICrmEmailAccount,
    options: SendEmailOptions,
): Promise<SendEmailResult> {
    if (!account.smtp) {
        return { success: false, error: 'SMTP configuration not found' };
    }

    try {
        const transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.smtp.username,
                pass: account.smtp.password,
            },
        });

        const info = await transporter.sendMail({
            from: account.displayName
                ? `"${account.displayName}" <${account.email}>`
                : account.email,
            to: options.to.map((a) => a.email).join(', '),
            cc: options.cc?.map((a) => a.email).join(', ') || undefined,
            bcc: options.bcc?.map((a) => a.email).join(', ') || undefined,
            subject: options.subject,
            html: options.bodyHtml,
            text: options.bodyText,
            replyTo: options.replyTo,
            inReplyTo: options.inReplyTo,
            attachments: options.attachments?.map((att) => ({
                filename: att.fileName,
                content: att.content,
                contentType: att.mimeType,
            })),
        });

        const email = await emailRepository.create({
            accountId: account._id.toString(),
            messageId: info.messageId,
            from: { email: account.email, name: account.displayName },
            to: options.to,
            cc: options.cc || [],
            replyTo: options.replyTo,
            inReplyTo: options.inReplyTo,
            subject: options.subject,
            bodyHtml: options.bodyHtml,
            bodyText: options.bodyText,
            date: new Date(),
            folder: 'sent',
            isRead: true,
            direction: 'outbound',
            contactId: options.contactId,
            companyId: options.companyId,
            dealId: options.dealId,
            hasAttachments: !!options.attachments && options.attachments.length > 0,
        });

        return {
            success: true,
            messageId: info.messageId,
            email,
        };
    } catch (error) {
        console.error('[IMAP Send] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send email',
        };
    }
}

/**
 * Find contact by email
 */
async function findContactByEmail(
    email: string,
): Promise<string | undefined> {
    try {
        const contact = await contactRepository.findByEmail(email);
        return contact?._id.toString();
    } catch (error) {
        console.error('[IMAP Sync] Error finding contact by email:', error);
        return undefined;
    }
}
