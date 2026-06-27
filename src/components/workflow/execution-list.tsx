'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export interface Execution {
  _id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  executionPath?: unknown[];
  error?: string;
  trigger?: {
    type: string;
    contactId?: string;
    dealId?: string;
    [key: string]: unknown;
  };
}

interface ExecutionListProps {
  executions: Execution[];
  loading?: boolean;
  onView: (execution: Execution) => void;
  onRetry?: (execution: Execution) => void;
}

export function ExecutionList({
  executions,
  loading,
  onView,
  onRetry,
}: ExecutionListProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-600">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'running':
        return <Badge className="bg-blue-600">Running</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        Loading executions...
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="mb-2">No executions found</p>
        <p className="text-sm">
          This workflow hasn&apos;t been executed yet
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Steps</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {executions.map((execution) => (
            <TableRow key={execution._id} className="hover:bg-gray-50">
              <TableCell>{getStatusBadge(execution.status)}</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium text-sm">
                    {format(new Date(execution.startedAt), 'MMM d, HH:mm')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(execution.startedAt), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">
                  {formatDuration(execution.duration)}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm">
                  {execution.executionPath?.length || 0} steps
                </span>
              </TableCell>
              <TableCell>
                <div className="text-sm text-gray-600">
                  {execution.trigger?.type || 'Manual'}
                  {execution.trigger?.contactId && (
                    <div className="text-xs text-gray-500">
                      Contact: {execution.trigger.contactId.slice(-6)}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView(execution)}
                  >
                    <Eye className="size-4 mr-2" />
                    View
                  </Button>
                  {execution.status === 'failed' && onRetry && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRetry(execution)}
                    >
                      <RefreshCw className="size-4 mr-2" />
                      Retry
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
