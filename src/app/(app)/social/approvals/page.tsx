'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  PenSquare,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import {
  SocialEmptyState,
  SocialPanel,
  SocialStatCard,
  SocialStatGrid,
  SocialToolbar,
} from '@/components/social/social-workspace';
import {
  Avatar,
  Button,
  Chip,
  Field,
  FormDialog,
  Input,
  Segmented,
  Select,
  Spinner,
  Textarea,
  type ChipTone,
} from '@/components/ui-kit';
import { Button as LinkButton } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

import { ApprovalPostPreview, type ApprovalPost } from './approval-post-preview';

interface ReviewComment {
  userId: string;
  userName?: string;
  text: string;
  createdAt: string;
}

interface Approval {
  _id: string;
  postId: string;
  postType: 'draft' | 'scheduled';
  brandId: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  comments?: ReviewComment[];
  createdAt: string;
  post?: ApprovalPost | null;
  submitterName?: string;
  brandName?: string;
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const ALL_VALUE = '__all__';

function statusTone(status: Approval['status']): ChipTone {
  switch (status) {
    case 'approved':
      return 'ok';
    case 'rejected':
      return 'danger';
    case 'cancelled':
      return 'gray';
    case 'pending':
    default:
      return 'warn';
  }
}

function ReviewComments({
  approval,
  onAddComment,
}: {
  approval: Approval;
  onAddComment: (approval: Approval, text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const comments = approval.comments || [];

  const submit = async () => {
    const text = draft.trim();
    if (!text || submitting) return;
    try {
      setSubmitting(true);
      await onAddComment(approval, text);
      setDraft('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare className="size-3.5" />
        Review comments{comments.length ? ` (${comments.length})` : ''}
      </div>

      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((comment, index) => (
            <li
              key={`${comment.userId}-${comment.createdAt}-${index}`}
              className="flex items-start gap-2 text-sm"
            >
              <Avatar name={comment.userName || ''} size={22} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">
                    {comment.userName || 'Unknown'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(comment.createdAt), 'MMM d · h:mm a')}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground/90">
                  {comment.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Add a comment…"
          className="h-9 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => void submit()}
          disabled={!draft.trim() || submitting}
        >
          Comment
        </Button>
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  highlighted,
  onCardRef,
  onReject,
  onApprove,
  onAddComment,
}: {
  approval: Approval;
  highlighted: boolean;
  onCardRef: (node: HTMLDivElement | null) => void;
  onReject: (approval: Approval) => void;
  onApprove: (approval: Approval) => void;
  onAddComment: (approval: Approval, text: string) => Promise<void>;
}) {
  return (
    <div
      ref={onCardRef}
      className={cn(
        'rounded-lg border bg-card p-4 shadow-card transition-colors',
        highlighted
          ? 'border-brand ring-2 ring-brand/40'
          : 'border-border',
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={statusTone(approval.status)} className="capitalize">
              {approval.status}
            </Chip>
            <Chip tone="gray" className="capitalize">
              {approval.postType}
            </Chip>
            {approval.brandName ? (
              <Chip tone="purple">{approval.brandName}</Chip>
            ) : null}
          </div>

          {approval.post ? (
            <ApprovalPostPreview post={approval.post} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {approval.postType === 'draft'
                ? 'Draft submission'
                : `Post ${approval.postId.slice(-8)}`}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={approval.submitterName || ''} size={20} />
              {approval.submitterName || `User ${approval.submittedBy.slice(-8)}`}
            </span>
            <span>
              Submitted {format(new Date(approval.createdAt), 'MMM d · h:mm a')}
            </span>
          </div>

          {approval.reviewNote ? (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <MessageSquare className="mt-0.5 size-4" />
              <span>{approval.reviewNote}</span>
            </div>
          ) : null}

          {approval.status === 'pending' ? (
            <ReviewComments approval={approval} onAddComment={onAddComment} />
          ) : null}
        </div>

        {approval.status === 'pending' ? (
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <Button
              variant="outline"
              size="sm"
              icon={XCircle}
              onClick={() => onReject(approval)}
            >
              Reject
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={CheckCircle}
              onClick={() => onApprove(approval)}
            >
              Approve
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const deepLinkPostId = searchParams.get('postId');

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('pending');
  const [brandFilter, setBrandFilter] = useState<string>(ALL_VALUE);
  const [submitterFilter, setSubmitterFilter] = useState<string>(ALL_VALUE);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [dialogAction, setDialogAction] = useState<'approve' | 'reject' | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    async function fetchApprovals() {
      try {
        setLoading(true);
        const status = activeFilter === 'all' ? '' : activeFilter;
        const response = await fetch(`/api/social/approvals?status=${status}`);

        if (!response.ok) {
          if (response.status === 403) {
            toast({ variant: 'destructive', title: 'Admin access required' });
            push('/social');
            return;
          }
          throw new Error('Failed to fetch approvals');
        }

        const data = await response.json();
        setApprovals(data.approvals || []);
        setStats(data.stats || { pending: 0, approved: 0, rejected: 0 });
      } catch {
        toast({ variant: 'destructive', title: 'Failed to load approvals' });
      } finally {
        setLoading(false);
      }
    }

    fetchApprovals();
  }, [activeFilter, push, session, toast]);

  // Brand / submitter filter options derived from the loaded queue.
  const brandOptions = useMemo(() => {
    const map = new Map<string, string>();
    approvals.forEach((a) => {
      if (!map.has(a.brandId)) {
        map.set(a.brandId, a.brandName || `Brand ${a.brandId.slice(-6)}`);
      }
    });
    return [
      { value: ALL_VALUE, label: 'All brands' },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [approvals]);

  const submitterOptions = useMemo(() => {
    const map = new Map<string, string>();
    approvals.forEach((a) => {
      if (!map.has(a.submittedBy)) {
        map.set(a.submittedBy, a.submitterName || `User ${a.submittedBy.slice(-6)}`);
      }
    });
    return [
      { value: ALL_VALUE, label: 'All submitters' },
      ...Array.from(map.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [approvals]);

  const visibleApprovals = useMemo(
    () =>
      approvals.filter((a) => {
        if (brandFilter !== ALL_VALUE && a.brandId !== brandFilter) return false;
        if (submitterFilter !== ALL_VALUE && a.submittedBy !== submitterFilter) return false;
        return true;
      }),
    [approvals, brandFilter, submitterFilter],
  );

  // Deep link: scroll to and highlight the targeted approval card once loaded.
  useEffect(() => {
    if (!deepLinkPostId || loading) return;
    const match = visibleApprovals.find((a) => a.postId === deepLinkPostId);
    if (!match) return;
    const node = cardRefs.current[match._id];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [deepLinkPostId, loading, visibleApprovals]);

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!selectedApproval) {
      return;
    }

    if (action === 'reject' && !reviewNote.trim()) {
      toast({ variant: 'destructive', title: 'Feedback is required' });
      throw new Error('Feedback is required');
    }

    try {
      setProcessing(true);
      const response = await fetch('/api/social/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalId: selectedApproval._id,
          action,
          reviewNote: reviewNote.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update approval');
      }

      toast({ title: action === 'approve' ? 'Post approved' : 'Post rejected' });
      setApprovals((current) =>
        current.filter((approval) => approval._id !== selectedApproval._id),
      );
      setStats((current) => ({
        pending: Math.max(current.pending - 1, 0),
        approved: action === 'approve' ? current.approved + 1 : current.approved,
        rejected: action === 'reject' ? current.rejected + 1 : current.rejected,
      }));
      setSelectedApproval(null);
      setReviewNote('');
      setDialogAction(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to update approval' });
      throw error;
    } finally {
      setProcessing(false);
    }
  };

  const handleAddComment = async (approval: Approval, text: string) => {
    try {
      const response = await fetch(`/api/social/approvals/${approval._id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to add comment');
      }

      const data = await response.json();
      const updated = data.approval as Approval | undefined;
      if (updated) {
        setApprovals((current) =>
          current.map((a) =>
            a._id === approval._id ? { ...a, comments: updated.comments } : a,
          ),
        );
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to add comment' });
      throw error;
    }
  };

  const approvalLabel = useMemo(
    () => FILTERS.find((filter) => filter.value === activeFilter)?.label || 'Pending',
    [activeFilter],
  );

  const filterBar = (
    <SocialToolbar>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={FILTERS} value={activeFilter} onChange={setActiveFilter} />
        {brandOptions.length > 1 ? (
          <Select
            options={brandOptions}
            value={brandFilter}
            onChange={setBrandFilter}
            triggerClassName="h-9 w-[160px]"
          />
        ) : null}
        {submitterOptions.length > 1 ? (
          <Select
            options={submitterOptions}
            value={submitterFilter}
            onChange={setSubmitterFilter}
            triggerClassName="h-9 w-[170px]"
          />
        ) : null}
      </div>
      <div className="text-sm text-muted-foreground">{visibleApprovals.length} items in view</div>
    </SocialToolbar>
  );

  return (
    <ModuleShell
      title="Approvals"
      icon={ShieldCheck}
      meta={`${stats.pending} pending review`}
      primaryAction={
        <LinkButton asChild size="sm">
          <a href="/social/drafts">
            <PenSquare className="mr-2 size-4" />
            Open drafts
          </a>
        </LinkButton>
      }
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <SocialStatGrid className="xl:grid-cols-3">
        <SocialStatCard
          label="Pending"
          value={String(stats.pending)}
          helper="Waiting for review"
          icon={Clock}
          tone="amber"
        />
        <SocialStatCard
          label="Approved"
          value={String(stats.approved)}
          helper="Ready for publishing"
          icon={CheckCircle}
          tone="green"
        />
        <SocialStatCard
          label="Rejected"
          value={String(stats.rejected)}
          helper="Sent back for edits"
          icon={XCircle}
          tone="red"
        />
      </SocialStatGrid>

      <SocialPanel
        title="Review queue"
        description={`${approvalLabel} items submitted for review`}
      >
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner size={28} />
          </div>
        ) : visibleApprovals.length === 0 ? (
          <SocialEmptyState
            icon={FileText}
            title="No approvals"
            description="New submissions will appear here."
          />
        ) : (
          <div className="space-y-3">
            {visibleApprovals.map((approval) => (
              <ApprovalCard
                key={approval._id}
                approval={approval}
                highlighted={deepLinkPostId === approval.postId}
                onCardRef={(node) => {
                  cardRefs.current[approval._id] = node;
                }}
                onReject={(target) => {
                  setSelectedApproval(target);
                  setDialogAction('reject');
                  setReviewNote('');
                }}
                onApprove={(target) => {
                  setSelectedApproval(target);
                  setDialogAction('approve');
                  setReviewNote('');
                }}
                onAddComment={handleAddComment}
              />
            ))}
          </div>
        )}
      </SocialPanel>

      <FormDialog
        open={dialogAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogAction(null);
            setSelectedApproval(null);
            setReviewNote('');
          }
        }}
        title={dialogAction === 'approve' ? 'Approve post' : 'Reject post'}
        description={
          dialogAction === 'approve'
            ? 'This post will move forward to publishing.'
            : 'Add feedback so the team knows what to change.'
        }
        icon={dialogAction === 'reject' ? XCircle : CheckCircle}
        submitLabel={dialogAction === 'approve' ? 'Approve' : 'Reject'}
        submitting={processing}
        submitDisabled={dialogAction === 'reject' && !reviewNote.trim()}
        destructive={dialogAction === 'reject'}
        onSubmit={() => (dialogAction ? handleAction(dialogAction) : undefined)}
      >
        {selectedApproval ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <User className="size-4" />
                {selectedApproval.submitterName ||
                  `User ${selectedApproval.submittedBy.slice(-8)}`}
              </span>
              {selectedApproval.brandName ? (
                <Chip tone="purple">{selectedApproval.brandName}</Chip>
              ) : null}
            </div>

            {selectedApproval.post ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <ApprovalPostPreview post={selectedApproval.post} contentClamp="" />
              </div>
            ) : null}

            <Field label={dialogAction === 'reject' ? 'Feedback' : 'Note'} htmlFor="approval-note">
              <Textarea
                id="approval-note"
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                placeholder={
                  dialogAction === 'reject'
                    ? 'Explain what needs to change'
                    : 'Optional note'
                }
                rows={5}
              />
            </Field>
          </div>
        ) : null}
      </FormDialog>
    </ModuleShell>
  );
}
