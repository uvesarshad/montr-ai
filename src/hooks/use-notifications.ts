'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useSocket } from '@/hooks/use-socket';
import { useToast } from '@/hooks/use-toast';

export interface ClientNotification {
    _id: string;
    userId: string;
    category: 'failure' | 'approval' | 'credit' | 'task' | 'marketing' | 'system';
    type: string;
    severity: 'info' | 'success' | 'warning' | 'error' | 'critical';
    title: string;
    body?: string;
    data?: Record<string, unknown>;
    actionUrl?: string;
    actionLabel?: string;
    read: boolean;
    archived?: boolean;
    requiresAction?: boolean;
    actionStatus?: 'pending' | 'approved' | 'rejected' | 'expired';
    createdAt: string;
}

const TOAST_SEVERITIES = new Set(['warning', 'error', 'critical']);

/**
 * Notification feed hook: loads recent items + unread count and keeps them live
 * over the per-user socket room. Also fires a transient toast for high-severity
 * arrivals.
 */
export function useNotifications() {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const { socket, isConnected } = useSocket();
    const { toast } = useToast();

    const [items, setItems] = useState<ClientNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const listenersAttached = useRef(false);

    const refetch = useCallback(async () => {
        try {
            const [listRes, countRes] = await Promise.all([
                fetch('/api/v2/notifications?limit=20'),
                fetch('/api/v2/notifications/unread-count'),
            ]);
            if (listRes.ok) {
                const data = await listRes.json();
                setItems(data.data ?? []);
            }
            if (countRes.ok) {
                const data = await countRes.json();
                setUnreadCount(data.count ?? 0);
            }
        } catch (err) {
            console.error('[notifications] fetch failed:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (userId) void refetch();
    }, [userId, refetch]);

    // Join the per-user room and wire live updates.
    useEffect(() => {
        if (!socket || !isConnected || !userId) return;

        // Server binds the room to the authenticated session user; no userId arg.
        socket.emit('notifications:join');

        if (!listenersAttached.current) {
            socket.on('notification:new', (n: ClientNotification) => {
                setItems((prev) => {
                    if (prev.some((p) => p._id === n._id)) return prev;
                    return [n, ...prev].slice(0, 50);
                });
                setUnreadCount((c) => c + 1);
                if (TOAST_SEVERITIES.has(n.severity)) {
                    toast({
                        variant: n.severity === 'warning' ? 'default' : 'destructive',
                        title: n.title,
                        description: n.body,
                    });
                }
            });

            socket.on('notification:unread-count', (payload: { count: number }) => {
                if (typeof payload?.count === 'number') setUnreadCount(payload.count);
            });

            listenersAttached.current = true;
        }

        return () => {
            socket.emit('notifications:leave');
        };
    }, [socket, isConnected, userId, toast]);

    const markRead = useCallback(async (id: string) => {
        setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
        setUnreadCount((c) => Math.max(0, c - 1));
        await fetch(`/api/v2/notifications/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ read: true }),
        }).catch(() => void refetch());
    }, [refetch]);

    const markAllRead = useCallback(async () => {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
        await fetch('/api/v2/notifications/read-all', { method: 'POST' }).catch(() => void refetch());
    }, [refetch]);

    const archive = useCallback(async (id: string) => {
        setItems((prev) => prev.filter((n) => n._id !== id));
        await fetch(`/api/v2/notifications/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: true }),
        }).catch(() => void refetch());
        void refetch();
    }, [refetch]);

    const act = useCallback(async (id: string, decision: 'approved' | 'rejected') => {
        const res = await fetch(`/api/v2/notifications/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision }),
        });
        if (res.ok) {
            setItems((prev) =>
                prev.map((n) => (n._id === id ? { ...n, actionStatus: decision, read: true } : n))
            );
        }
        return res.ok;
    }, []);

    return { items, unreadCount, loading, refetch, markRead, markAllRead, archive, act };
}
