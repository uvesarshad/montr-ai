'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ExecutionList, Execution } from './execution-list';
import { ExecutionDetail } from './execution-detail';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkflowExecutions } from '@/hooks/use-socket';

interface ExecutionViewerProps {
  workflowId: string;
  open?: boolean;
  onClose?: () => void;
}

export function ExecutionViewer({ workflowId, open, onClose }: ExecutionViewerProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  // Real-time WebSocket updates
  const { executions: realtimeExecutions, isConnected } = useWorkflowExecutions(workflowId);

  // Merge real-time executions with fetched executions
  useEffect(() => {
    if (realtimeExecutions.length > 0) {
      setExecutions((prev) => {
        const merged = [...(realtimeExecutions as unknown as Execution[])];

        // Add executions from API that aren't in realtime yet
        prev.forEach((exec) => {
          if (!merged.find((e) => e._id === exec._id)) {
            merged.push(exec);
          }
        });

        // Sort by startedAt (most recent first)
        return merged.sort((a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
        );
      });
    }
  }, [realtimeExecutions]);

  const fetchExecutions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      params.append('limit', '50');

      const response = await fetch(
        `/api/v2/workflows/${workflowId}/executions?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch executions');
      }

      const data = await response.json();
      setExecutions(data.executions || []);
    } catch (error: unknown) {
      console.error('Error fetching executions:', error);
      toast.error('Failed to load executions');
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [workflowId, statusFilter]);

  useEffect(() => {
    if (workflowId && open !== false) {
      fetchExecutions();
    }
  }, [fetchExecutions, workflowId, open]);

  const handleView = (execution: Execution) => {
    setSelectedExecution(execution);
    if (open !== undefined) {
      // If used as standalone, open detail dialog
      setShowDetailDialog(true);
    }
  };

  const handleRetry = async (execution: Execution) => {
    try {
      const response = await fetch(`/api/v2/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          triggerData: execution.trigger || {},
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to retry execution');
      }

      toast.success('Workflow execution started');
      fetchExecutions();
    } catch (error: unknown) {
      toast.error(`Failed to retry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getStatusCounts = () => {
    const counts = {
      all: executions.length,
      success: executions.filter((e) => e.status === 'success').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      running: executions.filter((e) => e.status === 'running').length,
    };
    return counts;
  };

  const counts = getStatusCounts();

  const content = (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ({counts.all})</SelectItem>
              <SelectItem value="success">Success ({counts.success})</SelectItem>
              <SelectItem value="failed">Failed ({counts.failed})</SelectItem>
              <SelectItem value="running">Running ({counts.running})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {/* Real-time connection status */}
          <Badge variant={isConnected ? 'default' : 'secondary'} className="gap-1">
            {isConnected ? (
              <>
                <Wifi className="size-3" />
                Live
              </>
            ) : (
              <>
                <WifiOff className="size-3" />
                Offline
              </>
            )}
          </Badge>

          <Button variant="outline" size="sm" onClick={fetchExecutions}>
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      {selectedExecution && !showDetailDialog ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedExecution(null)}
            className="mb-4"
          >
            ← Back to List
          </Button>
          <ExecutionDetail execution={selectedExecution as Parameters<typeof ExecutionDetail>[0]['execution']} />
        </div>
      ) : (
        <ExecutionList
          executions={executions}
          loading={loading}
          onView={handleView}
          onRetry={handleRetry}
        />
      )}

      {/* Detail Dialog (for standalone usage) */}
      {showDetailDialog && selectedExecution && (
        <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Execution Details</DialogTitle>
              <DialogDescription>
                Detailed log of workflow execution steps
              </DialogDescription>
            </DialogHeader>
            {/* @ts-expect-error */}
            <ExecutionDetail execution={selectedExecution} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );

  // If used as a dialog
  if (open !== undefined && onClose) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Workflow Executions</DialogTitle>
            <DialogDescription>
              View the execution history and logs for this workflow
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh]">{content}</ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  // If used as standalone component
  return <div>{content}</div>;
}
