'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import { GitBranch, Plus, RefreshCw, Target, CheckCircle2, Archive } from 'lucide-react';
import {
  PageHeader,
  Button,
  Card,
  Chip,
  Skeleton,
  EmptyState,
  FormDialog,
  Field,
  Input,
  Textarea,
} from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';

interface Strategy {
  _id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  version: number;
  goals: { kpi: string; target: string; deadline: string }[];
  channels: string[];
  createdAt: string;
  parentStrategyId?: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof GitBranch; tone: ChipTone }> = {
  draft:    { label: 'Draft',    icon: GitBranch,    tone: 'gray' },
  active:   { label: 'Active',   icon: CheckCircle2, tone: 'ok' },
  archived: { label: 'Archived', icon: Archive,      tone: 'gray' },
};

export default function StrategiesPage() {
  const { push } = useRouter();
  const { currentBrandId } = useCurrentBrand();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ goal: '', constraints: '' });
  const [formError, setFormError] = useState('');

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentBrandId) params.set('brandId', currentBrandId);
      const res = await fetch(`/api/v2/agent/strategies?${params}`);
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [currentBrandId]);

  useEffect(() => { fetchStrategies(); }, [fetchStrategies]);

  async function handleGenerate() {
    if (!form.goal.trim()) { setFormError('Goal is required.'); return; }
    setFormError('');
    setGenerating(true);
    try {
      const res = await fetch('/api/v2/agent/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: currentBrandId || 'default', goal: form.goal, constraints: form.constraints || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Generation failed.'); throw new Error(data.error); }
      setForm({ goal: '', constraints: '' });
      fetchStrategies();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        icon={Target}
        title="Strategies"
        actions={
          <>
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchStrategies}>
              Refresh
            </Button>
            <Button variant="brand" size="sm" icon={Plus} onClick={() => setShowDialog(true)}>
              Generate strategy
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-28" />)}
        </div>
      ) : strategies.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No strategies yet"
          note='Click "Generate strategy" to create one.'
          cta={<Button variant="brand" size="sm" icon={Plus} onClick={() => setShowDialog(true)}>Generate strategy</Button>}
        />
      ) : (
        <div className="space-y-3">
          {strategies.map(s => {
            const cfg = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.draft;
            return (
              <Card
                key={s._id}
                lift
                className="cursor-pointer"
                bodyClassName="px-5 py-4"
              >
                <div
                  className="flex items-start gap-3"
                  role="button"
                  tabIndex={0}
                  onClick={() => push(`/agent/strategies/${s._id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') push(`/agent/strategies/${s._id}`); }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold">{s.name}</h2>
                      <Chip tone={cfg.tone} icon={cfg.icon}>{cfg.label}</Chip>
                      <Chip tone="gray">v{s.version}</Chip>
                      {s.parentStrategyId && <Chip tone="info">iteration</Chip>}
                    </div>
                    {s.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                    )}
                    <div className="mt-2 flex items-center gap-4">
                      {s.goals.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {s.goals.length} goal{s.goals.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {s.channels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {s.channels.slice(0, 4).map(ch => (
                            <Chip key={ch} tone="gray">{ch}</Chip>
                          ))}
                          {s.channels.length > 4 && (
                            <Chip tone="gray">+{s.channels.length - 4}</Chip>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <FormDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        title="Generate strategy"
        icon={Target}
        size="md"
        submitLabel={generating ? 'Generating…' : 'Generate'}
        submitting={generating}
        onSubmit={handleGenerate}
      >
        {currentBrandId && (
          <p className="text-[12px] text-muted-foreground">
            Strategy will be generated for the currently selected brand.
          </p>
        )}
        <Field label="Goal" required htmlFor="goal">
          <Textarea
            id="goal"
            placeholder="e.g. Hire 5 engineers by August 30 via LinkedIn and referral channels."
            rows={3}
            value={form.goal}
            onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
          />
        </Field>
        <Field label="Constraints (optional)" htmlFor="constraints">
          <Input
            id="constraints"
            placeholder="e.g. Budget: $2k/month, no paid ads"
            value={form.constraints}
            onChange={e => setForm(f => ({ ...f, constraints: e.target.value }))}
          />
        </Field>
        {formError && <p className="text-[12px] text-danger">{formError}</p>}
      </FormDialog>
    </div>
  );
}
