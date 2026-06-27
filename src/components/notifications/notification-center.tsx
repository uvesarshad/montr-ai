'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCheck, Settings, BellOff } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button, EmptyState, Skeleton } from '@/components/ui-kit';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/types';
import { NotificationItem } from './notification-item';
import type { ClientNotification } from '@/hooks/use-notifications';

interface Props {
    items: ClientNotification[];
    loading: boolean;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onArchive: (id: string) => void;
    onAct: (id: string, decision: 'approved' | 'rejected') => void;
    onClose: () => void;
}

export function NotificationCenter({ items, loading, onMarkRead, onMarkAllRead, onArchive, onAct, onClose }: Props) {
    const [tab, setTab] = useState<string>('all');

    const visible = tab === 'all' ? items : items.filter((n) => n.category === tab);

    return (
        <div className="flex max-h-[32rem] w-[380px] flex-col">
            <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-semibold">Notifications</h2>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={CheckCheck}
                        onClick={onMarkAllRead}
                    >
                        Mark all read
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={Settings}
                        aria-label="Notification settings"
                        asChild
                    >
                        <Link href="/notifications" onClick={onClose} />
                    </Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="px-2">
                <TabsList className="h-8 w-full justify-start gap-1 bg-transparent p-0">
                    {NOTIFICATION_CATEGORIES.map((c) => (
                        <TabsTrigger
                            key={c.key}
                            value={c.key}
                            className="h-7 rounded-md px-2 text-xs data-[state=active]:bg-secondary"
                        >
                            {c.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <Separator className="mt-2" />

            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 w-full" />
                        ))}
                    </div>
                ) : visible.length === 0 ? (
                    <EmptyState icon={BellOff} title="You're all caught up" className="py-8" />
                ) : (
                    <div className="divide-y divide-border/60">
                        {visible.map((n) => (
                            <NotificationItem
                                key={n._id}
                                notification={n}
                                onMarkRead={onMarkRead}
                                onArchive={onArchive}
                                onAct={onAct}
                                onNavigate={onClose}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>

            <Separator />
            <Link
                href="/notifications"
                onClick={onClose}
                className="py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted/50"
            >
                View all notifications
            </Link>
        </div>
    );
}
