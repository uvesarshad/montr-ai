'use client';

import { useEffect, useState, useCallback, useReducer } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Target, CheckCircle2, GitBranch, Archive,
  RefreshCw, Zap, AlertCircle,
} from 'lucide-react';
import {
  Card,
  Chip,
  Button,
  IconButton,
  Skeleton,
  EmptyState,
} from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';

interface RoadmapEntry {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  channel?: string;
  dependsOn: string[];
  missionId?: string;
}

interface Strategy {
  _id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  version: number;
  goals: { kpi: string; target: string; deadline: string }[];
  channels: string[];
  cadence: Record<string, number>;
  contentMix: Record<string, number>;
  createdAt: string;
  parentStrategyId?: string;
  iterationNotes?: string;
}

interface Roadmap {
  entries: RoadmapEntry[];
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof GitBranch; tone: ChipTone }> = {
  draft:    { label: 'Draft',    icon: GitBranch,    tone: 'gray' },
  active:   { label: 'Active',   icon: CheckCircle2, tone: 'ok' },
  archived: { label: 'Archived', icon: Archive,      tone: 'gray' },
};

const ENTRY_STATUS_TONE: Record<string, ChipTone> = {
  pending:     'gray',
  in_progress: 'info',
  completed:   'ok',
  skipped:     'gray',
};

interface LoadState {
  strategy: Strategy | null;
  roadmap: Roadmap | null;
  loading: boolean;
  error: string | null;
}

type LoadAction =
  | { type: 'start' }
  | { type: 'loaded'; strategy: Strategy; roadmap: Roadmap | null }
  | { type: 'not_found' }
  | { type: 'error' };

const initialLoadState: LoadState = {
  strategy: null,
  roadmap: null,
  loading: true,
  error: null,
};

function loadReducer(state: LoadState, action: LoadAction): LoadState {
  switch (action.type) {
    case 'start':
      return { ...state, loading: true };
    case 'loaded':
      return { ...state, strategy: action.strategy, roadmap: action.roadmap, loading: false };
    case 'not_found':
      return { ...state, error: 'Strategy not found', loading: false };
    case 'error':
      return { ...state, error: 'Failed to load strategy', loading: false };
    default:
      return state;
  }
}

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { back, push } = useRouter();
  const [{ strategy, roadmap, loading, error }, dispatch] = useReducer(loadReducer, initialLoadState);
  const [decomposing, setDecomposing] = useState(false);
  const [instantiating, setInstantiating] = useState(false);

  const fetchDetail = useCallback(async () => {
    dispatch({ type: 'start' });
    try {
      const res = await fetch(`/api/v2/agent/strategies/${id}`);
      if (!res.ok) { dispatch({ type: 'not_found' }); return; }
      const data = await res.json();
      dispatch({ type: 'loaded', strategy: data.strategy, roadmap: data.roadmap ?? null });
    } catch {
      dispatch({ type: 'error' });
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleDecompose() {
    setDecomposing(true);
    try {
      const res = await fetch(`/api/v2/agent/strategies/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decompose' }),
      });
      if (res.ok) fetchDetail();
    } finally {
      setDecomposing(false);
    }
  }

  async function handleInstantiate() {
    setInstantiating(true);
    try {
      const res = await fetch(`/api/v2/agent/strategies/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'instantiate' }),
      });
      if (res.ok) fetchDetail();
    } finally {
      setInstantiating(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="p-6">
        <EmptyState
          icon={AlertCircle}
          title={error ?? 'Not found'}
          cta={<Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => back()}>Go back</Button>}
        />
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[strategy.status] ?? STATUS_CONFIG.draft;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <IconButton icon={ArrowLeft} iconSize={16} aria-label="Go back" className="shrink-0" onClick={() => back()} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold">{strategy.name}</h1>
            <Chip tone={statusCfg.tone} icon={statusCfg.icon}>{statusCfg.label}</Chip>
            <Chip tone="gray">v{strategy.version}</Chip>
          </div>
          {strategy.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{strategy.description}</p>
          )}
        </div>
        <Button variant="outline" size="sm" icon={RefreshCw} className="shrink-0" onClick={fetchDetail}>
          Refresh
        </Button>
      </div>

      {/* Goals + channels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card icon={Target} title="Goals">
          <div className="space-y-2 px-4 pb-4">
            {strategy.goals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goals defined.</p>
            ) : (
              strategy.goals.map((g) => (
                <div key={`${g.kpi}-${g.target}`} className="space-y-0.5 rounded-md border border-border p-2.5 text-sm">
                  <div className="font-medium">{g.kpi}: {g.target}</div>
                  <div className="text-xs text-muted-foreground">
                    Deadline: {new Date(g.deadline).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Channels & Cadence">
          <div className="space-y-3 px-4 pb-4">
            {strategy.channels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {strategy.channels.map(ch => (
                  <Chip key={ch} tone="gray">{ch}</Chip>
                ))}
              </div>
            )}
            {Object.entries(strategy.cadence).filter(([, v]) => v > 0).length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {Object.entries(strategy.cadence).filter(([, v]) => v > 0).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-medium">{v}/wk</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Roadmap */}
      <Card
        icon={Zap}
        title="Roadmap"
        meta={roadmap ? `${roadmap.entries.length} missions` : undefined}
        action={
          !roadmap ? (
            <Button size="sm" variant="outline" onClick={handleDecompose} disabled={decomposing}>
              {decomposing ? 'Decomposing…' : 'Decompose'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleInstantiate} disabled={instantiating}>
              {instantiating ? 'Instantiating…' : 'Instantiate missions'}
            </Button>
          )
        }
      >
        <div className="px-4 pb-4">
          {!roadmap ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No roadmap yet. Click &quot;Decompose&quot; to generate one.
            </p>
          ) : roadmap.entries.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Roadmap is empty.</p>
          ) : (
            <ol className="space-y-2">
              {roadmap.entries.map((entry, i) => (
                <li key={entry.id} className="flex items-start gap-3 text-sm">
                  <span className="w-5 shrink-0 pt-0.5 text-xs text-muted-foreground">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{entry.title}</span>
                      <Chip tone={ENTRY_STATUS_TONE[entry.status] ?? 'gray'}>{entry.status}</Chip>
                      {entry.channel && <Chip tone="gray">{entry.channel}</Chip>}
                    </div>
                    {entry.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                    )}
                    {entry.missionId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-0.5 h-auto px-0 text-brand-strong"
                        onClick={() => push(`/agent/missions/${entry.missionId}`)}
                      >
                        View mission →
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>

      {strategy.iterationNotes && (
        <Card title="Iteration notes">
          <div className="px-4 pb-4">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{strategy.iterationNotes}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
