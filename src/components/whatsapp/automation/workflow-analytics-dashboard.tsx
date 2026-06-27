'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import {
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import { Activity, CheckCircle2, XCircle, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { Card, KpiTile, Select } from '@/components/ui-kit';
import { subDays } from 'date-fns';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface WorkflowExecution {
    status: string;
    createdAt: string;
    completedAt?: string;
    steps?: unknown[];
}

export function WorkflowAnalyticsDashboard({ workflowId }: { workflowId?: string }) {
    const [dateRange, setDateRange] = useState('7d');

    // Calculate date params
    const endDate = new Date();
    let startDate = subDays(new Date(), 7);

    if (dateRange === '30d') startDate = subDays(new Date(), 30);
    if (dateRange === '90d') startDate = subDays(new Date(), 90);
    if (dateRange === '24h') startDate = subDays(new Date(), 1);

    const queryParams = new URLSearchParams({
        limit: '500', // Higher limit for analytics
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
    });

    if (workflowId) queryParams.set('workflowId', workflowId);

    const { data: executionsData } = useSWR(
        `/api/whatsapp/workflows/executions?${queryParams.toString()}`,
        fetcher,
        { refreshInterval: 10000 }
    );

    const executions: WorkflowExecution[] = executionsData?.executions || [];

    // Calculate metrics
    const totalExecutions = executions.length;
    const completedExecutions = executions.filter((e: WorkflowExecution) => e.status === 'completed').length;
    const failedExecutions = executions.filter((e: WorkflowExecution) => e.status === 'failed').length;
    const runningExecutions = executions.filter((e: WorkflowExecution) => e.status === 'running').length;

    const successRate =
        totalExecutions > 0 ? ((completedExecutions / totalExecutions) * 100).toFixed(1) : '0';

    const avgDuration =
        completedExecutions > 0
            ? Math.round(
                executions
                    .filter((e: WorkflowExecution) => e.status === 'completed' && e.completedAt)
                    .reduce((acc: number, e: WorkflowExecution) => {
                        const duration =
                            new Date(e.completedAt!).getTime() -
                            new Date(e.createdAt).getTime();
                        return acc + duration;
                    }, 0) / completedExecutions
            ) / 1000
            : 0;

    // Status distribution
    const statusData = [
        { name: 'Completed', value: completedExecutions, color: '#10b981' },
        { name: 'Failed', value: failedExecutions, color: '#ef4444' },
        { name: 'Running', value: runningExecutions, color: '#3b82f6' },
    ].filter((d) => d.value > 0);

    // Executions over time (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toISOString().split('T')[0];
    });

    const executionsByDay = last7Days.map((date) => {
        const dayExecutions = executions.filter(
            (e: WorkflowExecution) => e.createdAt.split('T')[0] === date
        );
        return {
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            total: dayExecutions.length,
            completed: dayExecutions.filter((e: WorkflowExecution) => e.status === 'completed').length,
            failed: dayExecutions.filter((e: WorkflowExecution) => e.status === 'failed').length,
        };
    });

    // Average steps per execution
    const avgSteps =
        totalExecutions > 0
            ? (
                executions.reduce((acc: number, e: WorkflowExecution) => acc + (e.steps?.length || 0), 0) /
                totalExecutions
            ).toFixed(1)
            : '0';

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h2 className="text-base font-semibold tracking-tight">Analytics Overview</h2>
                <div className="flex items-center gap-2">
                    <CalendarIcon className="size-4 text-muted-foreground" />
                    <Select
                        value={dateRange}
                        onChange={setDateRange}
                        triggerClassName="w-[160px]"
                        options={[
                            { value: '24h', label: 'Last 24 Hours' },
                            { value: '7d', label: 'Last 7 Days' },
                            { value: '30d', label: 'Last 30 Days' },
                            { value: '90d', label: 'Last 3 Months' },
                        ]}
                    />
                </div>
            </div>

            {/* Key Metrics */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <KpiTile icon={Activity} iconTone="info" label="Total Executions" value={totalExecutions} sub="All time" />
                <KpiTile icon={CheckCircle2} iconTone="ok" label="Success Rate" value={`${successRate}%`} sub={`${completedExecutions} completed`} />
                <KpiTile icon={Clock} iconTone="brand" label="Avg Duration" value={`${avgDuration}s`} sub="Per execution" />
                <KpiTile icon={XCircle} iconTone="warn" label="Failed" value={failedExecutions} sub={`${totalExecutions > 0 ? ((failedExecutions / totalExecutions) * 100).toFixed(1) : '0'}% failure rate`} />
            </div>

            {/* Charts */}
            <div className="grid gap-3 md:grid-cols-2">
                {/* Executions Over Time */}
                <Card icon={Activity} title="Executions Over Time" meta="Last 7 days">
                    <div className="px-4 pb-4">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={executionsByDay}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis dataKey="date" className="text-xs" />
                                <YAxis className="text-xs" />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} />
                                <Legend />
                                <Bar dataKey="completed" fill="hsl(var(--success))" name="Completed" />
                                <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Failed" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Status Distribution */}
                <Card icon={Activity} title="Status Distribution" meta="Current execution statuses">
                    <div className="px-4 pb-4">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={(entry) => `${entry.name}: ${entry.value}`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {statusData.map((entry) => (
                                        <Cell key={`cell-${entry.name}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Additional Metrics */}
            <div className="grid gap-3 md:grid-cols-3">
                <KpiTile icon={Activity} iconTone="info" label="Avg Steps per Execution" value={avgSteps} sub="Average workflow complexity" />
                <KpiTile icon={Activity} iconTone="ok" label="Active Workflows" value={runningExecutions} sub="Currently running" />
                <KpiTile
                    icon={Activity}
                    iconTone="brand"
                    label="Today's Executions"
                    value={executions.filter((e: WorkflowExecution) => e.createdAt.split('T')[0] === new Date().toISOString().split('T')[0]).length}
                    sub="In the last 24 hours"
                />
            </div>
        </div>
    );
}
