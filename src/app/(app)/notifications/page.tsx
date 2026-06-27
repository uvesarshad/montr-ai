'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Bell } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button, Card, Chip, EmptyState, Segmented, Skeleton } from '@/components/ui-kit';
import { useAppHeader } from '@/components/app-header';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/types';
import { NotificationItem } from '@/components/notifications/notification-item';
import { NotificationPreferencesForm } from '@/components/notifications/notification-preferences-form';
import type { ClientNotification } from '@/hooks/use-notifications';

type StatusFilter = 'all' | 'unread' | 'archived';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'unread', label: 'Unread' },
    { value: 'archived', label: 'Archived' },
];

export default function NotificationsPage() {
    const { setHeaderInfo } = useAppHeader();
    const [status, setStatus] = useState<StatusFilter>('all');
    const [category, setCategory] = useState<string>('all');
    const [items, setItems] = useState<ClientNotification[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        setHeaderInfo({ type: 'page', title: 'Notifications' });
        return () => setHeaderInfo(null);
    }, [setHeaderInfo]);

    const loadUnread = useCallback(async () => {
        try {
            const res = await fetch('/api/v2/notifications/unread-count');
            if (res.ok) setUnreadCount((await res.json()).count ?? 0);
        } catch {
            /* ignore */
        }
    }, []);

    const load = useCallback(async (cat: string, stat: StatusFilter, pageNum: number) => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(pageNum), limit: '25' });
        if (cat !== 'all') params.set('category', cat);
        if (stat === 'unread') params.set('read', 'false');
        if (stat === 'archived') params.set('archived', 'true');
        try {
            const res = await fetch(`/api/v2/notifications?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setItems((prev) => (pageNum === 1 ? data.data : [...prev, ...data.data]));
                setHasMore(data.pagination?.hasMore ?? false);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        setPage(1);
        void load(category, status, 1);
        void loadUnread();
    }, [category, status, load, loadUnread]);

    const markRead = useCallback(async (id: string) => {
        setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
        await fetch(`/api/v2/notifications/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ read: true }),
        });
    }, []);

    const markAllRead = useCallback(async () => {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
        await fetch('/api/v2/notifications/read-all', { method: 'POST' });
        if (status === 'unread') void load(category, status, 1);
    }, [status, category, load]);

    const archive = useCallback(async (id: string) => {
        setItems((prev) => prev.filter((n) => n._id !== id));
        await fetch(`/api/v2/notifications/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: true }),
        });
        void loadUnread();
    }, [loadUnread]);

    const act = useCallback(async (id: string, decision: 'approved' | 'rejected') => {
        const res = await fetch(`/api/v2/notifications/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision }),
        });
        if (res.ok) {
            setItems((prev) => prev.map((n) => (n._id === id ? { ...n, actionStatus: decision, read: true } : n)));
        }
    }, []);

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
            <Tabs defaultValue="inbox">
                <TabsList>
                    <TabsTrigger value="inbox" className="gap-1.5">
                        Inbox
                        {unreadCount > 0 && (
                            <Chip tone="brand" className="h-5 px-1.5 text-[10px]">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </Chip>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="preferences">Preferences</TabsTrigger>
                </TabsList>

                <TabsContent value="inbox" className="mt-4">
                    {/* Status segmented control + mark all read */}
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <Segmented
                            options={STATUS_OPTIONS}
                            value={status}
                            onChange={(v) => setStatus(v as StatusFilter)}
                        />
                        <Button variant="ghost" size="sm" icon={CheckCheck} onClick={markAllRead}>
                            Mark all read
                        </Button>
                    </div>

                    {/* Category chips */}
                    <div className="mb-3 flex flex-wrap gap-1.5">
                        {NOTIFICATION_CATEGORIES.map((c) => (
                            <Chip
                                key={c.key}
                                tone={category === c.key ? 'brand' : 'gray'}
                                selected={category === c.key}
                                onClick={() => setCategory(c.key)}
                            >
                                {c.label}
                            </Chip>
                        ))}
                    </div>

                    <Card>
                        {loading && items.length === 0 ? (
                            <div className="space-y-2 p-4">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <Skeleton key={`notif-sk-${i}`} className="h-14 w-full" />
                                ))}
                            </div>
                        ) : items.length === 0 ? (
                            <EmptyState
                                icon={Bell}
                                title={
                                    status === 'unread'
                                        ? "You're all caught up"
                                        : status === 'archived'
                                        ? 'No archived notifications'
                                        : 'No notifications here'
                                }
                            />
                        ) : (
                            <div className="divide-y divide-border/60">
                                {items.map((n) => (
                                    <NotificationItem
                                        key={n._id}
                                        notification={n}
                                        onMarkRead={markRead}
                                        onArchive={archive}
                                        onAct={act}
                                    />
                                ))}
                            </div>
                        )}
                    </Card>

                    {hasMore && (
                        <div className="mt-4 text-center">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const next = page + 1;
                                    setPage(next);
                                    void load(category, status, next);
                                }}
                            >
                                Load more
                            </Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="preferences" className="mt-4">
                    <NotificationPreferencesForm />
                </TabsContent>
            </Tabs>
        </div>
    );
}
