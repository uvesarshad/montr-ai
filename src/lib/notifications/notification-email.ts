/**
 * Email delivery for notifications: immediate (high-severity / opted-in) and a
 * once-daily digest of unread items. Uses the platform `sendEmail` helper.
 */

import { sendEmail, isEmailConfigured } from '@/lib/email';
import type { INotification, NotificationSeverity } from '@/lib/db/models/notification.model';
import { notificationRepository } from '@/lib/db/repository/notification.repository';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
    info: '#6366f1',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    critical: '#b91c1c',
};

function shell(title: string, inner: string): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;color:#374151;margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden;">
<div style="background:#111827;padding:24px 30px;"><h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">MontrAI</h1></div>
<div style="padding:30px;">${inner}</div>
<div style="background:#f9fafb;padding:20px;text-align:center;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-size:12px;color:#6b7280;">Manage your notification preferences at <a href="${APP_URL}/notifications" style="color:#6366f1;">${APP_URL}/notifications</a></p>
</div></div></body></html>`;
}

async function lookupEmail(userId: string): Promise<{ email: string; name?: string } | null> {
    const { userRepository } = await import('@/lib/db/repository/user.repository');
    const user = await userRepository.findById(userId);
    if (!user?.email) return null;
    return { email: user.email, name: user.name };
}

/** Immediate email for one high-severity / opted-in notification. */
export async function sendImmediateNotificationEmail(userId: string, n: INotification): Promise<void> {
    if (!isEmailConfigured()) return;
    const recipient = await lookupEmail(userId);
    if (!recipient) return;

    const color = SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info;
    const link = n.actionUrl ? (n.actionUrl.startsWith('http') ? n.actionUrl : `${APP_URL}${n.actionUrl}`) : `${APP_URL}/notifications`;

    const inner = `
        <div style="border-left:4px solid ${color};padding:4px 0 4px 16px;margin-bottom:20px;">
            <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">${escapeHtml(n.title)}</h2>
            ${n.body ? `<p style="margin:0;color:#4b5563;font-size:14px;">${escapeHtml(n.body)}</p>` : ''}
        </div>
        <div style="text-align:center;margin-top:24px;">
            <a href="${link}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:600;font-size:14px;">
                ${escapeHtml(n.actionLabel || 'View in MontrAI')}
            </a>
        </div>`;

    try {
        await sendEmail({
            to: recipient.email,
            subject: `[MontrAI] ${n.title}`,
            html: shell(n.title, inner),
            text: `${n.title}\n\n${n.body || ''}\n\n${link}`,
        });
    } catch (err) {
        console.error('[notifications] immediate email failed:', err);
    }
}

/** Build + send a daily digest of unread notifications for one user. */
export async function sendDigestEmail(userId: string, since: Date): Promise<boolean> {
    if (!isEmailConfigured()) return false;
    const recipient = await lookupEmail(userId);
    if (!recipient) return false;

    const items = await notificationRepository.findUnreadSince(userId, since);
    if (items.length === 0) return false;

    const rows = items
        .map((n) => {
            const color = SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info;
            return `<tr><td style="padding:12px;border-bottom:1px solid #eee;">
                <div style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;"></div>
                <strong style="color:#111827;">${escapeHtml(n.title)}</strong>
                ${n.body ? `<div style="color:#6b7280;font-size:13px;margin-top:2px;">${escapeHtml(n.body)}</div>` : ''}
            </td></tr>`;
        })
        .join('');

    const inner = `
        <p style="margin:0 0 16px;font-size:15px;">You have <strong>${items.length}</strong> unread notification${items.length === 1 ? '' : 's'}:</p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <div style="text-align:center;margin-top:24px;">
            <a href="${APP_URL}/notifications" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:11px 28px;border-radius:6px;font-weight:600;font-size:14px;">View all</a>
        </div>`;

    try {
        await sendEmail({
            to: recipient.email,
            subject: `[MontrAI] ${items.length} unread notification${items.length === 1 ? '' : 's'}`,
            html: shell('Your notification digest', inner),
            text: `You have ${items.length} unread notifications.\n\n${items.map((n) => `- ${n.title}`).join('\n')}\n\n${APP_URL}/notifications`,
        });
        return true;
    } catch (err) {
        console.error('[notifications] digest email failed:', err);
        return false;
    }
}

/** Run the daily digest for everyone who opted in. Called by the BullMQ job. */
export async function runDailyDigest(): Promise<{ sent: number }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const optIns = await notificationRepository.findDigestOptIns();
    let sent = 0;
    for (const pref of optIns) {
        const ok = await sendDigestEmail(pref.userId, since);
        if (ok) sent += 1;
    }
    console.log(`[notifications] daily digest sent to ${sent}/${optIns.length} users`);
    return { sent };
}

function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
