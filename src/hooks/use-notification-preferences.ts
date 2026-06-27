'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ChannelPref {
    inApp: boolean;
    email: boolean;
}

export interface NotificationPreferences {
    muteAll: boolean;
    emailDigest: boolean;
    categories: Record<string, ChannelPref>;
}

export function useNotificationPreferences() {
    const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const refetch = useCallback(async () => {
        try {
            const res = await fetch('/api/v2/notifications/preferences');
            if (res.ok) setPrefs(await res.json());
        } catch (err) {
            console.error('[notifications] preferences fetch failed:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    const update = useCallback(async (patch: Partial<NotificationPreferences>) => {
        setSaving(true);
        // Optimistic merge.
        setPrefs((prev) => (prev ? { ...prev, ...patch, categories: { ...prev.categories, ...(patch.categories ?? {}) } } : prev));
        try {
            const res = await fetch('/api/v2/notifications/preferences', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (res.ok) setPrefs(await res.json());
        } catch (err) {
            console.error('[notifications] preferences update failed:', err);
            void refetch();
        } finally {
            setSaving(false);
        }
    }, [refetch]);

    return { prefs, loading, saving, update, refetch };
}
