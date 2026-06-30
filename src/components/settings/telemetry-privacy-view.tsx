'use client';

import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import {
    Banner,
    Card,
    Chip,
    CollapsibleSection,
    SettingRow,
    Spinner,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { ShieldCheck, Check, X, Code2 } from 'lucide-react';
import {
    TELEMETRY_COLLECTED,
    TELEMETRY_NEVER_COLLECTED,
} from '@/lib/telemetry/policy';

/** A representative coarsened payload for the radical-transparency "see the payload" link. */
const SAMPLE_PAYLOAD = {
    schemaVersion: 1,
    policyVersion: '2026-06-20',
    industryVertical: 'dtc_skincare',
    goalType: 'grow_orders',
    channels: ['email', 'instagram'],
    strategyShape: { cadenceBucket: 'high', contentMix: 'ugc_heavy' },
    outcomeMetric: { kpi: 'orders', deltaBucket: '+10-25%' },
    horizonDays: 90,
    missionTemplateId: 'campaign-launch',
    installClass: 'self_host',
    batchId: 'a1b2c3d4e5f60718',
    recordedAt: '2026-06-27T00:00:00.000Z',
};

/**
 * Settings → Privacy: the install-wide flywheel telemetry opt-in.
 * Off by default, reversible anytime. Admin-only write (mirrors the API route).
 */
export function TelemetryPrivacyView() {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/v2/telemetry/consent');
                if (res.ok) {
                    const data = await res.json();
                    setEnabled(Boolean(data.telemetryEnabled));
                }
            } catch {
                // best-effort; leave the safe default (off)
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleToggle = async (next: boolean) => {
        setSaving(true);
        // Optimistic — revert on failure.
        setEnabled(next);
        try {
            const res = await fetch('/api/v2/telemetry/consent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok) throw new Error('Failed to update consent');
            toast({
                title: next ? 'Telemetry enabled' : 'Telemetry disabled',
                description: next
                    ? 'Thank you — anonymized, aggregated outcome data will help improve MontrAI.'
                    : 'No telemetry will be collected from this install.',
            });
        } catch {
            setEnabled(!next);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Could not update telemetry consent. You may need admin access.',
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Spinner size={24} />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-[13px] font-semibold">Privacy &amp; Telemetry</h3>
                <p className="text-[12px] text-muted-foreground">
                    Telemetry is opt-in and off by default. Nothing leaves this install unless you turn it on.
                </p>
            </div>

            <Card
                icon={ShieldCheck}
                title="Anonymized outcome telemetry"
                meta="opt-in · off by default"
                action={enabled ? <Chip tone="ok">On</Chip> : <Chip tone="gray">Off</Chip>}
                bodyClassName="px-4 pb-4 space-y-4"
            >
                <SettingRow
                    label="Share anonymized, aggregated outcome data"
                    description="Help improve MontrAI's AI by sharing coarsened, aggregated signals about what worked — no brand names, no content, no contacts, ever. Reversible anytime."
                >
                    <Switch
                        id="telemetry-consent"
                        checked={enabled}
                        disabled={saving}
                        onCheckedChange={handleToggle}
                    />
                </SettingRow>

                <div className="grid gap-4 sm:grid-cols-2 border-t border-border/60 pt-4">
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            What we collect
                        </h4>
                        <ul className="space-y-1.5">
                            {TELEMETRY_COLLECTED.map((line) => (
                                <li key={line} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                                    <Check className="size-3.5 mt-0.5 shrink-0 text-emerald-500" />
                                    <span>{line}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            What we never collect
                        </h4>
                        <ul className="space-y-1.5">
                            {TELEMETRY_NEVER_COLLECTED.map((line) => (
                                <li key={line} className="flex items-start gap-2 text-[12.5px] text-muted-foreground">
                                    <X className="size-3.5 mt-0.5 shrink-0 text-rose-500" />
                                    <span>{line}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <CollapsibleSection icon={Code2} title="See a sample payload" defaultOpen={false}>
                    <p className="text-[12px] text-muted-foreground mb-2">
                        This is the exact shape of a single event that would be sent — bucketed and anonymized at the source.
                    </p>
                    <pre className="text-[11.5px] leading-relaxed bg-muted/50 rounded-lg p-3 overflow-x-auto border border-border/60">
                        {JSON.stringify(SAMPLE_PAYLOAD, null, 2)}
                    </pre>
                </CollapsibleSection>

                <Banner tone="info">
                    Outcomes are coarsened into ranges and enums before they ever leave this install, and aggregates are
                    only used above a k-anonymity threshold — so no single brand&apos;s data is ever identifiable.
                </Banner>
            </Card>
        </div>
    );
}
