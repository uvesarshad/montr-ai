'use client';

import {
    Workflow,
    Sparkles,
    PhoneOff,
    MessageSquareWarning,
    MessageCircle,
    MailWarning,
    Users,
    FileWarning,
    Bot,
    AlertTriangle,
    BatteryLow,
    BatteryWarning,
    BatteryCharging,
    CalendarCheck,
    CalendarX,
    ShieldQuestion,
    ShieldCheck,
    ShieldX,
    Megaphone,
    AlertCircle,
    Info,
    Bell,
    type LucideIcon,
} from 'lucide-react';
import { metaForType } from '@/lib/notifications/types';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
    Workflow,
    Sparkles,
    PhoneOff,
    MessageSquareWarning,
    MessageCircle,
    MailWarning,
    Users,
    FileWarning,
    Bot,
    AlertTriangle,
    BatteryLow,
    BatteryWarning,
    BatteryCharging,
    CalendarCheck,
    CalendarX,
    ShieldQuestion,
    ShieldCheck,
    ShieldX,
    Megaphone,
    AlertCircle,
    Info,
    Bell,
};

const SEVERITY_STYLES: Record<string, string> = {
    info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    error: 'bg-red-500/10 text-red-600 dark:text-red-400',
    critical: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export function NotificationIcon({
    type,
    severity,
    className,
}: {
    type: string;
    severity: string;
    className?: string;
}) {
    const meta = metaForType(type);
    const Icon = ICONS[meta.icon] ?? Bell;
    return (
        <div
            className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info,
                className
            )}
        >
            <Icon className="size-4" />
        </div>
    );
}
