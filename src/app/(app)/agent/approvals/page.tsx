'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, XCircle, Clock, AlertCircle, RefreshCw, Inbox, UserPlus } from 'lucide-react';
import { useCurrentBrand } from '@/hooks/use-current-brand';
import {
  Button,
  Card,
  Chip,
  Skeleton,
  EmptyState,
  PageHeader,
  BulkBar,
} from '@/components/ui-kit';
import { Textarea, Input } from '@/components/ui-kit';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingAction {
  _id: string;
  toolName: string;
  toolDescription: string;
  toolArgs: Record<string, unknown>;
  missionId?: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
  expiresAt?: string;
  delegatedBy?: string;
  delegatedTo?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { push } = useRouter();
  const { currentBrandId } = useCurrentBrand();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [bulkDeciding, setBulkDeciding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const fetchActions = useCallback(async (silent = false) => {
    try {
      const params = new URLSearchParams();
      if (currentBrandId) params.set('brandId', currentBrandId);
      const res = await fetch(`/api/v2/agent/approvals?${params}`);
      const data = await res.json();
      setActions(data.approvals ?? []);
    } catch {
      // silent
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentBrandId]);

  useEffect(() => {
    fetchActions();
    const interval = setInterval(() => fetchActions(true), 5000);
    return () => clearInterval(interval);
  }, [fetchActions, currentBrandId]);

  const handleApprove = async (id: string) => {
    setDeciding(id);
    try {
      const res = await fetch(`/api/v2/agent/approvals/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        toast.success('Action approved');
        setActions(prev => prev.filter(a => a._id !== id));
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      } else {
        toast.error('Failed to approve action');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeciding(null);
    }
  };

  const handleReject = async (id: string) => {
    setDeciding(id);
    const reason = rejectReasons[id] || 'User rejected the action';
    try {
      const res = await fetch(`/api/v2/agent/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success('Action rejected');
        setActions(prev => prev.filter(a => a._id !== id));
        setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      } else {
        toast.error('Failed to reject action');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setDeciding(null);
    }
  };

  const handleDelegate = async (id: string, delegateTo: string) => {
    try {
      const res = await fetch(`/api/v2/agent/approvals/${id}/delegate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegateTo }),
      });
      if (res.ok) {
        toast.success('Action delegated');
        setActions(prev => prev.filter(a => a._id !== id));
      } else {
        toast.error('Failed to delegate action');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkDeciding(true);
    const ids = Array.from(selected);
    await Promise.allSettled(ids.map(id =>
      fetch(`/api/v2/agent/approvals/${id}/approve`, { method: 'POST' })
    ));
    toast.success(`Approved ${ids.length} action${ids.length > 1 ? 's' : ''}`);
    setActions(prev => prev.filter(a => !selected.has(a._id)));
    setSelected(new Set());
    setBulkDeciding(false);
  };

  const handleBulkReject = async () => {
    if (selected.size === 0) return;
    setBulkDeciding(true);
    const ids = Array.from(selected);
    await Promise.allSettled(ids.map(id =>
      fetch(`/api/v2/agent/approvals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Bulk rejected' }),
      })
    ));
    toast.success(`Rejected ${ids.length} action${ids.length > 1 ? 's' : ''}`);
    setActions(prev => prev.filter(a => !selected.has(a._id)));
    setSelected(new Set());
    setBulkDeciding(false);
  };

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <PageHeader
        icon={CheckCircle}
        title="Approval Queue"
        sub="Actions the agent wants to take that require your sign-off."
        actions={
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={() => fetchActions()}>
            Refresh
          </Button>
        }
      />

      {/* Bulk actions toolbar */}
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="primary" size="sm" icon={CheckCircle} onClick={handleBulkApprove} disabled={bulkDeciding}>
          Approve all
        </Button>
        <Button variant="outline" size="sm" icon={XCircle} onClick={handleBulkReject} disabled={bulkDeciding}>
          Reject all
        </Button>
      </BulkBar>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`skeleton-${i}`} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending approvals"
          note="Actions that need your sign-off will appear here."
        />
      ) : (
        <div className="space-y-3">
          {actions.map(action => (
            <ActionCard
              key={action._id}
              action={action}
              selected={selected.has(action._id)}
              deciding={deciding === action._id}
              rejectReason={rejectReasons[action._id] ?? ''}
              onRejectReasonChange={reason =>
                setRejectReasons(prev => ({ ...prev, [action._id]: reason }))
              }
              onSelect={() => toggleSelect(action._id)}
              onApprove={() => handleApprove(action._id)}
              onReject={() => handleReject(action._id)}
              onDelegate={(delegateTo) => handleDelegate(action._id, delegateTo)}
              onViewMission={() => action.missionId && push(`/agent/missions/${action.missionId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

interface ActionCardProps {
  action: PendingAction;
  selected: boolean;
  deciding: boolean;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelegate: (delegateTo: string) => void;
  onViewMission: () => void;
}

function ActionCard({
  action,
  selected,
  deciding,
  rejectReason,
  onRejectReasonChange,
  onSelect,
  onApprove,
  onReject,
  onDelegate,
  onViewMission,
}: ActionCardProps) {
  const [showArgs, setShowArgs] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [showDelegateInput, setShowDelegateInput] = useState(false);
  const [delegateTo, setDelegateTo] = useState('');

  const timeAgo = formatTimeAgo(action.createdAt);
  const expiresIn = action.expiresAt
    ? Math.max(0, Math.round((new Date(action.expiresAt).getTime() - Date.now()) / 60_000))
    : null;

  return (
    <Card className={cn('transition-colors', selected && 'ring-2 ring-ring')}>
      <div className="space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          {/* Selection checkbox */}
          <button
            type="button"
            onClick={onSelect}
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-muted-foreground/40"
            aria-label="Select"
          >
            {selected && <CheckCircle className="size-3 text-brand-strong" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-sm font-semibold">{action.toolName}</div>
            <p className="mt-1 text-sm text-foreground">{action.toolDescription}</p>
            {action.delegatedBy && (
              <p className="mt-0.5 text-xs text-warning-foreground">
                Delegated by {action.delegatedBy}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Chip tone="gray" icon={Clock} className="h-[19px] text-[11px]">{timeAgo}</Chip>
            {expiresIn !== null && (
              <span className={cn('text-xs', expiresIn < 5 ? 'text-danger' : 'text-muted-foreground')}>
                {expiresIn}m left
              </span>
            )}
          </div>
        </div>

        {/* Args preview */}
        <div>
          <button
            type="button"
            className="text-xs text-brand-strong underline underline-offset-2"
            onClick={() => setShowArgs(v => !v)}
          >
            {showArgs ? 'Hide' : 'Show'} arguments
          </button>
          {showArgs && (
            <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
              {JSON.stringify(action.toolArgs, null, 2)}
            </pre>
          )}
        </div>

        {/* Reject reason input */}
        {showRejectInput && (
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={rejectReason}
            onChange={e => onRejectReasonChange(e.target.value)}
            className="h-16 resize-none"
          />
        )}

        {/* Delegate input */}
        {showDelegateInput && (
          <div className="flex gap-2">
            <Input
              placeholder="User ID to delegate to"
              value={delegateTo}
              onChange={e => setDelegateTo(e.target.value)}
              wrapClassName="flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!delegateTo.trim()}
              onClick={() => {
                onDelegate(delegateTo.trim());
                setShowDelegateInput(false);
                setDelegateTo('');
              }}
            >
              Send
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowDelegateInput(false)}>
              Cancel
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" icon={CheckCircle} onClick={onApprove} disabled={deciding}>
            Approve
          </Button>
          {showRejectInput ? (
            <Button size="sm" icon={XCircle} onClick={onReject} disabled={deciding}
              className="border-danger bg-danger text-danger-foreground hover:opacity-90">
              Confirm Reject
            </Button>
          ) : (
            <Button size="sm" variant="outline" icon={XCircle} onClick={() => setShowRejectInput(true)} disabled={deciding}>
              Reject
            </Button>
          )}
          {!showDelegateInput && (
            <Button size="sm" variant="ghost" icon={UserPlus} onClick={() => setShowDelegateInput(true)} disabled={deciding}>
              Delegate
            </Button>
          )}
          {action.missionId && (
            <Button size="sm" variant="ghost" icon={AlertCircle} onClick={onViewMission} className="ml-auto">
              View mission
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
