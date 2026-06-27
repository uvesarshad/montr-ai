'use client';

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Check, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui-kit';
import { NotificationIcon } from './notification-icon';
import type { ClientNotification } from '@/hooks/use-notifications';

interface Props {
    notification: ClientNotification;
    onMarkRead: (id: string) => void;
    onArchive: (id: string) => void;
    onAct: (id: string, decision: 'approved' | 'rejected') => void;
    onNavigate?: () => void;
}

export function NotificationItem({ notification: n, onMarkRead, onArchive, onAct, onNavigate }: Props) {
    const router = useRouter();

    const timeAgo = (() => {
        try {
            return formatDistanceToNow(new Date(n.createdAt), { addSuffix: true });
        } catch {
            return '';
        }
    })();

    const handleClick = () => {
        if (!n.read) onMarkRead(n._id);
        if (n.actionUrl) {
            onNavigate?.();
            router.push(n.actionUrl);
        }
    };

    const showApprovalActions = n.requiresAction && (!n.actionStatus || n.actionStatus === 'pending');

    return (
        <div
            className={cn(
                'group relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50',
                !n.read && 'bg-brand/[0.04]'
            )}
        >
            {!n.read && <span className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand" />}

            <NotificationIcon type={n.type} severity={n.severity} />

            <div className="min-w-0 flex-1">
                <button type="button" onClick={handleClick} className="block w-full text-left">
                    <p className={cn('text-sm leading-snug', !n.read ? 'font-semibold text-foreground' : 'text-foreground/90')}>
                        {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground/70">{timeAgo}</p>
                </button>

                {showApprovalActions && (
                    <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => onAct(n._id, 'approved')}>
                            Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onAct(n._id, 'rejected')}>
                            Reject
                        </Button>
                    </div>
                )}
                {n.requiresAction && n.actionStatus && n.actionStatus !== 'pending' && (
                    <p className="mt-1 text-[11px] font-medium capitalize text-muted-foreground">{n.actionStatus}</p>
                )}
            </div>

            <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!n.read && (
                    <IconButton
                        icon={Check}
                        iconSize={14}
                        aria-label="Mark as read"
                        onClick={() => onMarkRead(n._id)}
                        className="size-6"
                    />
                )}
                <IconButton
                    icon={Archive}
                    iconSize={14}
                    aria-label="Archive"
                    onClick={() => onArchive(n._id)}
                    className="size-6"
                />
            </div>
        </div>
    );
}
