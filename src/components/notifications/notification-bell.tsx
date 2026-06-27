'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/use-notifications';
import { NotificationCenter } from './notification-center';

export function NotificationBell() {
    const [open, setOpen] = useState(false);
    const { items, unreadCount, loading, markRead, markAllRead, archive, act } = useNotifications();

    const badge = unreadCount > 99 ? '99+' : String(unreadCount);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
                    className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                    <Bell className="size-4" />
                    {unreadCount > 0 && (
                        <span
                            className={cn(
                                'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white'
                            )}
                        >
                            {badge}
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} className="w-auto p-0">
                <NotificationCenter
                    items={items}
                    loading={loading}
                    onMarkRead={markRead}
                    onMarkAllRead={markAllRead}
                    onArchive={archive}
                    onAct={act}
                    onClose={() => setOpen(false)}
                />
            </PopoverContent>
        </Popover>
    );
}
