'use client';

import { WorkflowLog } from '@/hooks/crm/use-workflow';
import { Chip, Skeleton, EmptyState } from '@/components/ui-kit';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react';

interface WorkflowLogsProps {
  logs: WorkflowLog[];
  loading: boolean;
}

export function WorkflowLogs({ logs, loading }: WorkflowLogsProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No execution logs yet"
        note="Logs will appear here once the workflow has been triggered."
      />
    );
  }

  return (
    <div className="space-y-2">
      {logs.map(log => (
        <div key={log._id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card text-sm">
          <div className="shrink-0 mt-0.5">
            {log.status === 'success' ? (
              <CheckCircle className="size-4 text-green-500" />
            ) : log.status === 'failed' ? (
              <XCircle className="size-4 text-destructive" />
            ) : (
              <AlertCircle className="size-4 text-yellow-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Chip
                tone={
                  log.status === 'success' ? 'ok' :
                  log.status === 'failed' ? 'danger' : 'warn'
                }
              >
                {log.status}
              </Chip>
              <span className="text-xs text-muted-foreground capitalize">{log.entityType}</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{log.actionsExecuted} actions</span>
              {log.executionTimeMs && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{log.executionTimeMs}ms</span>
                </>
              )}
            </div>
            {log.errors?.length > 0 && (
              <p className="text-xs text-destructive mt-1 truncate">{log.errors[0]}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDistanceToNow(new Date(log.triggeredAt), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  );
}
