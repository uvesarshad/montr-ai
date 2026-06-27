/**
 * Analytics Overview Component
 *
 * Displays key metrics with stat cards
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  XCircle,
  Clock,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { AnalyticsSummary } from '@/hooks/use-analytics';

interface AnalyticsOverviewProps {
  summary: AnalyticsSummary;
}

export function AnalyticsOverview({ summary }: AnalyticsOverviewProps) {
  const metrics = [
    {
      title: 'Total Executions',
      value: summary.totalExecutions.toLocaleString(),
      icon: Activity,
      description: 'All workflow runs',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Success Rate',
      value: `${summary.successRate.toFixed(1)}%`,
      icon: TrendingUp,
      description: `${summary.successfulExecutions} successful`,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Failed',
      value: summary.failedExecutions.toLocaleString(),
      icon: XCircle,
      description: 'Failed executions',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Avg Duration',
      value: formatDuration(summary.averageDuration),
      icon: Clock,
      description: 'Per execution',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Avg Steps',
      value: summary.averageStepsPerExecution.toFixed(1),
      icon: Layers,
      description: 'Nodes per execution',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Running',
      value: summary.runningExecutions.toLocaleString(),
      icon: Activity,
      description: 'Currently executing',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              <div className={`${metric.bgColor} p-2 rounded-lg`}>
                <Icon className={`size-4 ${metric.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {metric.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
