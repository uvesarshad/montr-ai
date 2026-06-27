'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, Lightbulb, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import {
    Button,
    Card,
    Chip,
    Spinner,
    type ChipTone,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface Recommendation {
    title: string;
    detail: string;
    kind: 'budget' | 'fatigue' | 'performer' | 'anomaly' | 'opportunity';
    severity: 'info' | 'warn' | 'critical';
    entityName?: string;
}

const KIND_ICONS = {
    budget: Wallet,
    fatigue: TrendingDown,
    performer: TrendingUp,
    anomaly: AlertTriangle,
    opportunity: Lightbulb,
} as const;

const SEVERITY_TONES: Record<Recommendation['severity'], ChipTone> = {
    info: 'info',
    warn: 'warn',
    critical: 'danger',
};

/**
 * AI insights over the org's ad performance — suggestions only, applied by
 * the user manually (guardrail §3.5). Generation is explicitly
 * user-triggered (it consumes AI credits).
 */
export function AdsInsightsCard({ brandId }: { brandId?: string | null }) {
    const { toast } = useToast();
    const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);
    const [busy, setBusy] = useState(false);

    const generate = useCallback(async () => {
        setBusy(true);
        try {
            const response = await fetch('/api/v2/ads/recommendations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId: brandId || undefined, days: 14 }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Generation failed');

            if (!data.hasData) {
                toast({ title: 'Not enough data yet', description: 'Insights need at least a few days of synced campaign metrics.' });
                setRecommendations([]);
                return;
            }
            setRecommendations(data.recommendations || []);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Generation failed';
            toast({ variant: 'destructive', title: 'Could not generate insights', description: message });
        } finally {
            setBusy(false);
        }
    }, [brandId, toast]);

    return (
        <Card
            icon={Sparkles}
            title="AI insights"
            spotlight
            action={
                <Button size="sm" variant="brand" icon={busy ? undefined : Sparkles} disabled={busy} onClick={generate}>
                    {busy ? <Spinner size={14} /> : null}
                    {recommendations ? 'Regenerate' : 'Generate'}
                </Button>
            }
        >
            {recommendations === null ? (
                <p className="py-4 text-sm text-muted-foreground">
                    Analyze the last 14 days of campaign performance — budget pacing, creative fatigue,
                    top/bottom performers, and anomalies. Suggestions only: you decide what to change, in the
                    platform, yourself.
                </p>
            ) : recommendations.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                    Nothing actionable found — check back once more campaign data has synced.
                </p>
            ) : (
                <div className="divide-y divide-border">
                    {recommendations.map((recommendation) => {
                        const Icon = KIND_ICONS[recommendation.kind];
                        return (
                            <div key={`${recommendation.kind}-${recommendation.title}`} className="flex gap-3 py-3">
                                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted">
                                    <Icon className="size-4 text-muted-foreground" />
                                </span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{recommendation.title}</span>
                                        <Chip tone={SEVERITY_TONES[recommendation.severity]}>{recommendation.kind}</Chip>
                                        {recommendation.entityName && (
                                            <span className="truncate text-xs text-muted-foreground">{recommendation.entityName}</span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-sm text-muted-foreground">{recommendation.detail}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}
