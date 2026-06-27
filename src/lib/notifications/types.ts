/**
 * Notification type registry — the single source of truth shared by the server
 * (category/severity defaults) and the UI (icon + colour). Add a new `type`
 * here and both sides pick it up.
 */

import type { NotificationCategory, NotificationSeverity } from '@/lib/db/models/notification.model';

export interface NotificationTypeMeta {
    category: NotificationCategory;
    severity: NotificationSeverity;
    /** lucide-react icon name resolved in the UI (see notification-icon.tsx). */
    icon: string;
    /** Human label for grouping / fallbacks. */
    label: string;
}

export const TYPE_META: Record<string, NotificationTypeMeta> = {
    // ---- Failures (per module) ----
    'failure.automation': { category: 'failure', severity: 'error', icon: 'Workflow', label: 'Automation failed' },
    'failure.ai_studio': { category: 'failure', severity: 'error', icon: 'Sparkles', label: 'AI Studio generation failed' },
    'failure.voice': { category: 'failure', severity: 'error', icon: 'PhoneOff', label: 'Voice call failed' },
    'failure.conversation': { category: 'failure', severity: 'warning', icon: 'MessageSquareWarning', label: 'Conversation needs attention' },
    'failure.whatsapp': { category: 'failure', severity: 'error', icon: 'MessageCircle', label: 'WhatsApp failure' },
    'failure.email': { category: 'failure', severity: 'error', icon: 'MailWarning', label: 'Email failure' },
    'failure.crm': { category: 'failure', severity: 'error', icon: 'Users', label: 'CRM failure' },
    'failure.forms': { category: 'failure', severity: 'error', icon: 'FileWarning', label: 'Forms failure' },
    'failure.docs': { category: 'failure', severity: 'error', icon: 'FileWarning', label: 'Docs failure' },
    'failure.chatbot': { category: 'failure', severity: 'warning', icon: 'Bot', label: 'Chatbot failure' },
    'failure.generic': { category: 'failure', severity: 'error', icon: 'AlertTriangle', label: 'Something failed' },

    // ---- Credits ----
    'credit.low': { category: 'credit', severity: 'warning', icon: 'BatteryLow', label: 'Credits running low' },
    'credit.exhausted': { category: 'credit', severity: 'critical', icon: 'BatteryWarning', label: 'Credits exhausted' },
    'credit.refilled': { category: 'credit', severity: 'success', icon: 'BatteryCharging', label: 'Credits refilled' },

    // ---- Scheduled tasks ----
    'task.completed': { category: 'task', severity: 'success', icon: 'CalendarCheck', label: 'Scheduled task completed' },
    'task.failed': { category: 'task', severity: 'error', icon: 'CalendarX', label: 'Scheduled task failed' },

    // ---- Approvals ----
    'approval.requested': { category: 'approval', severity: 'warning', icon: 'ShieldQuestion', label: 'Approval requested' },
    'approval.approved': { category: 'approval', severity: 'success', icon: 'ShieldCheck', label: 'Approved' },
    'approval.rejected': { category: 'approval', severity: 'error', icon: 'ShieldX', label: 'Rejected' },

    // ---- Social post approvals (audit C8 2026-06-06) ----
    'social_post_pending_approval': { category: 'approval', severity: 'warning', icon: 'ShieldQuestion', label: 'Post awaiting approval' },
    'social_post_approved': { category: 'approval', severity: 'success', icon: 'ShieldCheck', label: 'Post approved' },
    'social_post_rejected': { category: 'approval', severity: 'error', icon: 'ShieldX', label: 'Post rejected' },

    // ---- Social accounts ----
    'social_account_expired': { category: 'system', severity: 'warning', icon: 'Unplug', label: 'Social account disconnected' },

    // ---- Plan / quota ----
    'plan.execution_quota_reached': { category: 'system', severity: 'warning', icon: 'Workflow', label: 'Automation limit reached' },

    // ---- Marketing (super-admin broadcasts) ----
    'marketing.announcement': { category: 'marketing', severity: 'info', icon: 'Megaphone', label: 'Announcement' },

    // ---- Generic system ----
    'system.alert': { category: 'system', severity: 'warning', icon: 'AlertCircle', label: 'System alert' },
    'system.info': { category: 'system', severity: 'info', icon: 'Info', label: 'System notice' },
};

/** Resolve category/severity/icon defaults for a type, with safe fallbacks. */
export function metaForType(type: string): NotificationTypeMeta {
    return (
        TYPE_META[type] ?? {
            category: (type.split('.')[0] as NotificationCategory) || 'system',
            severity: 'info',
            icon: 'Bell',
            label: type,
        }
    );
}

/** Categories surfaced as tabs in the notification center. */
export const NOTIFICATION_CATEGORIES: { key: NotificationCategory | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'failure', label: 'Failures' },
    { key: 'approval', label: 'Approvals' },
    { key: 'credit', label: 'Credits' },
    { key: 'task', label: 'Tasks' },
    { key: 'system', label: 'System' },
];
