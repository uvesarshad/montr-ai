'use client';

import { useState } from 'react';
import { useWorkflows, Workflow } from '@/hooks/crm/use-workflows';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  Chip,
  IconButton,
  Skeleton,
  EmptyState,
  ConfirmDialog,
  ActionMenu,
} from '@/components/ui-kit';
import { MoreVertical, Edit, Trash2, GitBranch, Play, FileText, Zap } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const TRIGGER_LABELS: Record<string, string> = {
  record_created: 'Record Created',
  record_updated: 'Record Updated',
  field_changed: 'Field Changed',
  stage_changed: 'Stage Changed',
  deal_won: 'Deal Won',
  deal_lost: 'Deal Lost',
  tag_added: 'Tag Added',
  tag_removed: 'Tag Removed',
  scheduled: 'Scheduled',
  manual: 'Manual',
  webhook_received: 'Webhook Received',
};

interface WorkflowListProps {
  onEdit?: (id: string) => void;
  onViewLogs?: (id: string) => void;
  searchQuery?: string;
}

export function WorkflowList({ onEdit, onViewLogs, searchQuery = '' }: WorkflowListProps) {
  const { workflows, loading, error, activate, deactivate, deleteWorkflow } = useWorkflows({
    search: searchQuery || undefined,
    limit: 50,
  });
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  const filtered = searchQuery
    ? workflows.filter(w =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : workflows;

  const handleToggle = async (workflow: Workflow) => {
    setToggleLoading(workflow._id);
    try {
      if (workflow.isActive) {
        await deactivate(workflow._id);
        toast({ title: 'Workflow deactivated' });
      } else {
        await activate(workflow._id);
        toast({ title: 'Workflow activated' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to update workflow status.' });
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!workflowToDelete) return;
    try {
      await deleteWorkflow(workflowToDelete);
      toast({ title: 'Workflow deleted' });
      setDeleteDialogOpen(false);
      setWorkflowToDelete(null);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete workflow.' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <div className="px-5 pb-5 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="px-4 pb-4">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      </Card>
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No workflows yet"
        note="Create your first workflow to automate CRM tasks."
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        {filtered.map(workflow => (
          <Card key={workflow._id}>
            <div className="p-5">
              <div className="flex items-start gap-4">
                <div className="size-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                  <Zap className="size-4 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm truncate">{workflow.name}</h3>
                    <Chip
                      tone={workflow.isActive ? 'ok' : 'gray'}
                    >
                      {workflow.isActive ? 'Active' : 'Inactive'}
                    </Chip>
                  </div>
                  {workflow.description && (
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">{workflow.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Play className="size-3" />
                      {TRIGGER_LABELS[workflow.trigger.type] ?? workflow.trigger.type}
                    </span>
                    <span>•</span>
                    <span className="capitalize">{workflow.trigger.entityType}</span>
                    <span>•</span>
                    <span>{workflow.executionCount} runs</span>
                    {workflow.lastExecutedAt && (
                      <>
                        <span>•</span>
                        <span>Last run {formatDistanceToNow(new Date(workflow.lastExecutedAt), { addSuffix: true })}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={workflow.isActive}
                    disabled={toggleLoading === workflow._id}
                    onCheckedChange={() => handleToggle(workflow)}
                  />
                  <ActionMenu
                    trigger={<IconButton icon={MoreVertical} />}
                    align="end"
                    items={[
                      { label: 'Edit', icon: Edit, onSelect: () => onEdit?.(workflow._id) },
                      { label: 'View Logs', icon: FileText, onSelect: () => onViewLogs?.(workflow._id) },
                      {
                        label: 'Delete',
                        icon: Trash2,
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => { setWorkflowToDelete(workflow._id); setDeleteDialogOpen(true); },
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Workflow?"
        description="This will permanently delete the workflow and all its execution history."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
