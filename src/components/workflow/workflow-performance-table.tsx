/**
 * Workflow Performance Table Component
 *
 * Displays performance metrics for all workflows
 */

'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { WorkflowStat } from '@/hooks/use-analytics';
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

function SortButton({ field, onSort }: { field: keyof WorkflowStat; onSort: (field: keyof WorkflowStat) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="flex items-center gap-1 hover:text-gray-900 transition-colors"
    >
      <ArrowUpDown className="size-3" />
    </button>
  );
}

interface WorkflowPerformanceTableProps {
  workflows: WorkflowStat[];
  title?: string;
  description?: string;
  maxRows?: number;
}

export function WorkflowPerformanceTable({
  workflows,
  title = 'Workflow Performance',
  description = 'Performance metrics for all workflows',
  maxRows,
}: WorkflowPerformanceTableProps) {
  const [sortField, setSortField] = React.useState<keyof WorkflowStat>('totalExecutions');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  const displayWorkflows = maxRows ? workflows.slice(0, maxRows) : workflows;

  const sortedWorkflows = [...displayWorkflows].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  const handleSort = (field: keyof WorkflowStat) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
      active: { label: 'Active', variant: 'default' },
      paused: { label: 'Paused', variant: 'secondary' },
      draft: { label: 'Draft', variant: 'outline' },
    };

    const config = statusMap[status] || { label: status, variant: 'outline' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <div className="flex items-center gap-1">
                  Workflow
                  <SortButton field="workflowName" onSort={handleSort} />
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Type
                </div>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  Executions
                  <SortButton field="totalExecutions" onSort={handleSort} />
                </div>
              </TableHead>
              <TableHead>
                <div className="flex items-center gap-1">
                  Success Rate
                  <SortButton field="successRate" onSort={handleSort} />
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  Avg Duration
                  <SortButton field="averageDuration" onSort={handleSort} />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedWorkflows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No workflow data available
                </TableCell>
              </TableRow>
            ) : (
              sortedWorkflows.map((workflow) => (
                <TableRow key={workflow.workflowId}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{workflow.workflowName}</div>
                      <div className="text-xs text-muted-foreground">
                        {workflow.workflowId.toString().substring(0, 8)}...
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {workflow.workflowType}
                    </Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(workflow.status)}</TableCell>
                  <TableCell className="text-right font-mono">
                    <div>
                      <div>{workflow.totalExecutions}</div>
                      <div className="text-xs text-muted-foreground">
                        {workflow.successfulExecutions} success, {workflow.failedExecutions} failed
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{workflow.successRate.toFixed(1)}%</span>
                        {workflow.successRate >= 90 ? (
                          <TrendingUp className="size-4 text-green-600" />
                        ) : workflow.successRate < 70 ? (
                          <TrendingDown className="size-4 text-red-600" />
                        ) : null}
                      </div>
                      <Progress
                        value={workflow.successRate}
                        className="h-2"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatDuration(workflow.averageDuration)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
