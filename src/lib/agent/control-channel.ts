/**
 * WhatsApp Control Channel (G12, 2026-06-05)
 *
 * Lets a paired owner drive their agent from WhatsApp:
 *   PAIR <code> · status · approve <n> · reject <n> · goal <text> · stop · help
 *
 * Security model (see docs/plan/agent-phase3-deferred-designs-2026-06-05.md §2):
 *   - Activation only via code pairing started from the authenticated web app
 *     (6-digit code displayed in the UI; the user texts it in — user-initiated
 *     direction, so no Meta business-initiated template is needed).
 *   - Every command is scoped to the BOUND USER's own data
 *     (approve/reject pass { organizationId, userId } scope).
 *   - create_ad_campaign and bulk_call approvals are app-only (deep link).
 *   - 20 commands/hour per binding; pairing capped at 3 attempts / 10 min.
 *   - Every command is written to the CRM audit log.
 *
 * The webhook divert runs BEFORE processIncomingMessage so control traffic
 * never creates CRM contacts/activities and never reaches bots.
 */

import crypto from 'node:crypto';
import AgentControlBinding, { IAgentControlBinding } from '@/lib/db/models/agent-control-binding.model';
import { resolveDefaultMissionMode } from '@/lib/agent/safety-defaults';
import type { IWhatsAppAccount } from '@/lib/db/models/whatsapp-account.model';
import { dbConnect } from '@/lib/db/connect';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 3;
const APPROVAL_MAP_TTL_MS = 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_COMMANDS = 20;

/** Approvals too consequential to review in a chat bubble — app-only. */
const APP_ONLY_APPROVAL_TOOLS = new Set(['create_ad_campaign', 'bulk_call']);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Digits-only normalization — matches Meta webhook `from` format. */
export function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
}

function hashCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
}

function deepLink(path: string): string {
    return APP_URL ? `${APP_URL.replace(/\/$/, '')}${path}` : path;
}

// ─── Command parsing (pure — unit tested) ─────────────────────────────────────

export type ControlCommand =
    | { kind: 'pair'; code: string }
    | { kind: 'status' }
    | { kind: 'approve'; index: number }
    | { kind: 'reject'; index: number }
    | { kind: 'goal'; text: string }
    | { kind: 'stop' }
    | { kind: 'help' };

export function parseControlCommand(text: string): ControlCommand {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    const pairMatch = lower.match(/^pair\s+(\d{6})$/);
    if (pairMatch) return { kind: 'pair', code: pairMatch[1] };

    if (/^(status|st)$/.test(lower)) return { kind: 'status' };

    const approveMatch = lower.match(/^(approve|yes|ok)\s+(\d{1,2})$/);
    if (approveMatch) return { kind: 'approve', index: parseInt(approveMatch[2], 10) };

    const rejectMatch = lower.match(/^(reject|no)\s+(\d{1,2})$/);
    if (rejectMatch) return { kind: 'reject', index: parseInt(rejectMatch[2], 10) };

    // [\s\S] instead of the dotAll flag — tsconfig targets pre-es2018.
    const goalMatch = trimmed.match(/^goal\s+([\s\S]{5,500})$/i);
    if (goalMatch) return { kind: 'goal', text: goalMatch[1].trim() };

    if (/^(stop|revoke|unpair)$/.test(lower)) return { kind: 'stop' };

    return { kind: 'help' };
}

const HELP_TEXT = [
    'MontrAI Agent commands:',
    '• status — missions + pending approvals',
    '• approve <n> / reject <n> — decide a pending action from the last status',
    '• goal <your business goal> — start a strategy mission',
    '• stop — disconnect this phone',
].join('\n');

// ─── Pairing (web-app side) ───────────────────────────────────────────────────

export interface StartPairingResult {
    success: boolean;
    code?: string;
    whatsappNumber?: string;
    expiresAt?: string;
    error?: string;
}

/**
 * Start (or restart) pairing for a user. Generates the code the web UI shows;
 * the user texts `PAIR <code>` to the brand's WhatsApp number to activate.
 */
export async function startPairing(params: {
    userId: string;
    brandId?: string | null;
    phone: string;
}): Promise<StartPairingResult> {
    await dbConnect();

    const phone = normalizePhone(params.phone);
    if (phone.length < 7 || phone.length > 15) {
        return { success: false, error: 'Enter a valid phone number with country code.' };
    }

    const WhatsAppAccount = (await import('@/lib/db/models/whatsapp-account.model')).default;
    const accountQuery: Record<string, unknown> = {
        status: 'active',
    };
    const account = (params.brandId
        ? await WhatsAppAccount.findOne({ ...accountQuery, brandId: params.brandId }).exec()
            ?? await WhatsAppAccount.findOne(accountQuery).exec()
        : await WhatsAppAccount.findOne(accountQuery).exec()) as IWhatsAppAccount | null;

    if (!account) {
        return { success: false, error: 'No active WhatsApp account connected. Connect one in the WhatsApp module first.' };
    }

    // The control phone must not be the business number itself.
    if (normalizePhone(account.phoneNumber || '') === phone) {
        return { success: false, error: 'Use your personal phone number, not the business WhatsApp number.' };
    }

    const code = crypto.randomInt(100000, 1000000).toString();

    // One binding per (org, phone): restart pairing replaces any prior state.
    await AgentControlBinding.findOneAndUpdate(
        { phone },
        {
            $set: {
                userId: params.userId,
                brandId: params.brandId ?? null,
                whatsappAccountId: account._id.toString(),
                status: 'pending',
                pairingCodeHash: hashCode(code),
                pairingExpiresAt: new Date(Date.now() + PAIRING_TTL_MS),
                pairingAttempts: 0,
                approvalMap: [],
                approvalMapExpiresAt: null,
            },
        },
        { upsert: true },
    ).exec();

    return {
        success: true,
        code,
        whatsappNumber: account.displayPhoneNumber || account.phoneNumber,
        expiresAt: new Date(Date.now() + PAIRING_TTL_MS).toISOString(),
    };
}

export async function getBindingForUser(userId: string) {
    await dbConnect();
    return AgentControlBinding.findOne({
        userId,
        status: { $in: ['pending', 'active'] },
    }).exec();
}

export async function revokeBinding(userId: string): Promise<boolean> {
    await dbConnect();
    const result = await AgentControlBinding.updateMany(
        { userId, status: { $in: ['pending', 'active'] } },
        { $set: { status: 'revoked', pairingCodeHash: null, approvalMap: [] } },
    ).exec();
    return result.modifiedCount > 0;
}

// ─── Webhook-side handling ────────────────────────────────────────────────────

/**
 * Divert entry called from the WhatsApp webhook AFTER account resolution and
 * BEFORE any CRM/bot processing. Returns true when the message was control
 * traffic (the webhook should stop processing it).
 */
export async function handleControlMessage(params: {
    account: IWhatsAppAccount;
    from: string;
    text: string;
}): Promise<boolean> {
    const { account, text } = params;
    if (!text.trim()) return false;

    await dbConnect();
    const phone = normalizePhone(params.from);
    const binding = await AgentControlBinding.findOne({
        phone,
        status: { $in: ['pending', 'active'] },
    }).exec();

    if (!binding) return false; // Not a control phone — normal webhook flow.

    const command = parseControlCommand(text);

    try {
        if (binding.status === 'pending') {
            await handlePairingAttempt(binding, command, account, phone);
            return true;
        }

        // Active binding — rate limit, then execute.
        const allowed = await checkRateLimit(binding);
        if (!allowed) {
            await reply(account, phone, 'Rate limit reached (20 commands/hour). Try again later or use the app.');
            return true;
        }

        await executeCommand(binding, command, account, phone);
    } catch (error) {
        console.error('[ControlChannel] command failed:', error);
        await reply(account, phone, 'Something went wrong handling that command. Try again or use the app.').catch(() => undefined);
    }

    return true;
}

async function handlePairingAttempt(
    binding: IAgentControlBinding,
    command: ControlCommand,
    account: IWhatsAppAccount,
    phone: string,
): Promise<void> {
    if (command.kind !== 'pair') {
        await reply(account, phone, 'This phone has a pending pairing. Send: PAIR <6-digit code> (shown in the MontrAI app).');
        return;
    }

    if (!binding.pairingCodeHash || !binding.pairingExpiresAt || binding.pairingExpiresAt < new Date()) {
        await reply(account, phone, 'The pairing code expired. Generate a new one in the MontrAI app (Agent ▸ Settings).');
        return;
    }

    if (binding.pairingAttempts >= PAIRING_MAX_ATTEMPTS) {
        await AgentControlBinding.updateOne({ _id: binding._id }, { $set: { status: 'revoked' } }).exec();
        await reply(account, phone, 'Too many incorrect codes — pairing cancelled. Restart it from the MontrAI app.');
        return;
    }

    if (hashCode(command.code) !== binding.pairingCodeHash) {
        await AgentControlBinding.updateOne({ _id: binding._id }, { $inc: { pairingAttempts: 1 } }).exec();
        await reply(account, phone, `Incorrect code (${binding.pairingAttempts + 1}/${PAIRING_MAX_ATTEMPTS}). Check the code in the app and try again.`);
        return;
    }

    await AgentControlBinding.updateOne(
        { _id: binding._id },
        {
            $set: {
                status: 'active',
                pairingCodeHash: null,
                pairingExpiresAt: null,
                pairedAt: new Date(),
                lastUsedAt: new Date(),
            },
        },
    ).exec();

    await audit(binding, 'paired');
    await reply(account, phone, `✅ Paired. This phone now controls your MontrAI agent.\n\n${HELP_TEXT}`);
}

async function checkRateLimit(binding: IAgentControlBinding): Promise<boolean> {
    const now = new Date();
    const windowExpired = !binding.windowStart || (now.getTime() - binding.windowStart.getTime()) > RATE_WINDOW_MS;

    if (windowExpired) {
        await AgentControlBinding.updateOne(
            { _id: binding._id },
            { $set: { windowStart: now, windowCount: 1, lastUsedAt: now } },
        ).exec();
        return true;
    }

    if (binding.windowCount >= RATE_MAX_COMMANDS) return false;

    await AgentControlBinding.updateOne(
        { _id: binding._id },
        { $inc: { windowCount: 1 }, $set: { lastUsedAt: now } },
    ).exec();
    return true;
}

async function executeCommand(
    binding: IAgentControlBinding,
    command: ControlCommand,
    account: IWhatsAppAccount,
    phone: string,
): Promise<void> {
    switch (command.kind) {
        case 'pair':
            await reply(account, phone, 'This phone is already paired. Send "status" to see what your agent is doing.');
            return;

        case 'status': {
            await audit(binding, 'status');
            await reply(account, phone, await buildStatusMessage(binding));
            return;
        }

        case 'approve':
        case 'reject': {
            await handleDecision(binding, command, account, phone);
            return;
        }

        case 'goal': {
            const { agentMissionRepository } = await import('@/lib/db/repository/agent-mission.repository');
            const mission = await agentMissionRepository.create({
                brandId: binding.brandId || binding.userId,
                userId: binding.userId,
                title: command.text.length > 60 ? `${command.text.slice(0, 57)}…` : command.text,
                summary: `Goal issued via WhatsApp control: ${command.text}`,
                status: 'active',
                // Never autonomous from chat (design rule); OSS safety (H6)
                // makes this supervised by default — permissive env restores 'mixed'.
                mode: resolveDefaultMissionMode(),
                activeAgentId: 'strategy-agent',
            });
            await audit(binding, `goal: ${command.text.slice(0, 120)}`);
            await reply(
                account,
                phone,
                `🎯 Goal mission created: "${command.text.slice(0, 80)}"\n\nOpen it to run Goal Mode (strategy → approval → missions):\n${deepLink(`/agent/missions/${mission._id.toString()}`)}`,
            );
            return;
        }

        case 'stop': {
            await AgentControlBinding.updateOne({ _id: binding._id }, { $set: { status: 'revoked' } }).exec();
            await audit(binding, 'revoked via stop');
            await reply(account, phone, 'Disconnected. This phone no longer controls your agent. Re-pair anytime from the app.');
            return;
        }

        case 'help':
        default:
            await reply(account, phone, HELP_TEXT);
    }
}

async function buildStatusMessage(binding: IAgentControlBinding): Promise<string> {
    const AgentMission = (await import('@/lib/db/models/agent-mission.model')).default;
    const { getPendingActions } = await import('@/lib/agent/hitl-gateway');

    const [active, waiting, hibernating, pending] = await Promise.all([
        AgentMission.countDocuments({ userId: binding.userId, status: 'active' }).exec(),
        AgentMission.countDocuments({ userId: binding.userId, status: 'waiting' }).exec(),
        AgentMission.countDocuments({ userId: binding.userId, status: 'scheduled' }).exec(),
        getPendingActions(binding.userId),
    ]);

    const lines: string[] = [
        `🤖 Agent status — ${active} active · ${waiting} waiting · ${hibernating} hibernating`,
    ];

    const approvals = (pending ?? []).slice(0, 9);
    if (approvals.length) {
        lines.push('', `Pending approvals (${approvals.length}):`);
        const map: { index: number; actionId: string }[] = [];
        approvals.forEach((action, i) => {
            const n = i + 1;
            map.push({ index: n, actionId: String(action._id) });
            const appOnly = APP_ONLY_APPROVAL_TOOLS.has(action.toolName);
            lines.push(`${n}. ${action.toolDescription?.slice(0, 120) || action.toolName}${appOnly ? ' (app-only)' : ''}`);
        });
        lines.push('', 'Reply "approve <n>" or "reject <n>".');

        await AgentControlBinding.updateOne(
            { _id: binding._id },
            {
                $set: {
                    approvalMap: map,
                    approvalMapExpiresAt: new Date(Date.now() + APPROVAL_MAP_TTL_MS),
                },
            },
        ).exec();
    } else {
        lines.push('No approvals waiting on you. ✅');
    }

    lines.push('', `App: ${deepLink('/agent')}`);
    return lines.join('\n');
}

async function handleDecision(
    binding: IAgentControlBinding,
    command: { kind: 'approve' | 'reject'; index: number },
    account: IWhatsAppAccount,
    phone: string,
): Promise<void> {
    if (!binding.approvalMapExpiresAt || binding.approvalMapExpiresAt < new Date() || !binding.approvalMap?.length) {
        await reply(account, phone, 'No recent approval list — send "status" first, then approve/reject by number.');
        return;
    }

    const entry = binding.approvalMap.find((e) => e.index === command.index);
    if (!entry) {
        await reply(account, phone, `No pending action #${command.index} in the last status. Send "status" for the current list.`);
        return;
    }

    const PendingAgentAction = (await import('@/lib/db/models/pending-agent-action.model')).default;
    const action = await PendingAgentAction.findOne({
        _id: entry.actionId
    }).exec();

    if (!action || action.status !== 'pending') {
        await reply(account, phone, 'That action is no longer pending (already decided or expired). Send "status" to refresh.');
        return;
    }

    // App-only approvals: too much surface to review in a chat bubble.
    if (command.kind === 'approve' && APP_ONLY_APPROVAL_TOOLS.has(action.toolName)) {
        await reply(
            account,
            phone,
            `⚠️ "${action.toolName}" must be reviewed in the app (full draft shown there):\n${deepLink('/agent/approvals')}`,
        );
        return;
    }

    const { approveAction, rejectAction } = await import('@/lib/agent/hitl-gateway');
    const scope = { userId: binding.userId };

    if (command.kind === 'approve') {
        await approveAction(entry.actionId, binding.userId, scope);
        await audit(binding, `approved ${action.toolName} (${entry.actionId})`);
        await reply(account, phone, `✅ Approved: ${action.toolDescription?.slice(0, 100) || action.toolName}`);
    } else {
        await rejectAction(entry.actionId, binding.userId, 'Rejected via WhatsApp control', scope);
        await audit(binding, `rejected ${action.toolName} (${entry.actionId})`);
        await reply(account, phone, `❌ Rejected: ${action.toolDescription?.slice(0, 100) || action.toolName}`);
    }
}

// ─── Plumbing ─────────────────────────────────────────────────────────────────

async function reply(account: IWhatsAppAccount, toPhone: string, body: string): Promise<void> {
    const { whatsappService } = await import('@/lib/services/whatsapp.service');
    await whatsappService.sendMessage(account, {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body },
    } as Parameters<typeof whatsappService.sendMessage>[1]);
}

async function audit(binding: IAgentControlBinding, what: string): Promise<void> {
    try {
        const { auditLogRepository } = await import('@/lib/db/repository/crm/audit-log.repository');
        await auditLogRepository.create({
            entityType: 'agent_control_binding',
            entityId: binding._id.toString(),
            entityName: `WhatsApp control: ${what}`,
            action: 'updated',
            changes: [{ field: 'command', oldValue: null, newValue: what }],
            source: 'api',
            userId: binding.userId,
        });
    } catch (error) {
        console.error('[ControlChannel] audit failed:', error);
    }
}
