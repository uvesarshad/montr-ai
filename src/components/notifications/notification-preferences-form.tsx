'use client';

import { Switch } from '@/components/ui/switch';
import { Card, Skeleton, SettingRow } from '@/components/ui-kit';
import { cn } from '@/lib/utils';
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/types';
import { useNotificationPreferences } from '@/hooks/use-notification-preferences';

const CATEGORY_ROWS = NOTIFICATION_CATEGORIES.filter((c) => c.key !== 'all');

export function NotificationPreferencesForm() {
    const { prefs, loading, update } = useNotificationPreferences();

    if (loading || !prefs) {
        return (
            <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Card title="Global" bodyClassName="px-4 divide-y divide-border/60">
                <SettingRow
                    label="Mute all notifications"
                    description="Stop receiving every in-app and email notification."
                >
                    <Switch checked={prefs.muteAll} onCheckedChange={(v) => update({ muteAll: v })} />
                </SettingRow>
                <SettingRow
                    label="Daily email digest"
                    description="A once-daily summary of unread notifications."
                >
                    <Switch checked={prefs.emailDigest} onCheckedChange={(v) => update({ emailDigest: v })} />
                </SettingRow>
            </Card>

            <Card title="By category" bodyClassName="overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    <span>Category</span>
                    <span className="w-12 text-center">In-app</span>
                    <span className="w-12 text-center">Email</span>
                </div>
                {CATEGORY_ROWS.map((c, idx) => {
                    const pref = prefs.categories?.[c.key] ?? { inApp: true, email: false };
                    return (
                        <div
                            key={c.key}
                            className={cn(
                                'grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3',
                                idx > 0 && 'border-t border-border/60'
                            )}
                        >
                            <span className="text-sm">{c.label}</span>
                            <div className="flex w-12 justify-center">
                                <Switch
                                    checked={pref.inApp}
                                    onCheckedChange={(v) =>
                                        update({ categories: { [c.key]: { ...pref, inApp: v } } })
                                    }
                                />
                            </div>
                            <div className="flex w-12 justify-center">
                                <Switch
                                    checked={pref.email}
                                    onCheckedChange={(v) =>
                                        update({ categories: { [c.key]: { ...pref, email: v } } })
                                    }
                                />
                            </div>
                        </div>
                    );
                })}
            </Card>
        </div>
    );
}
