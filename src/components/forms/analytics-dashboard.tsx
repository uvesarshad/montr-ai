'use client';

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from 'recharts';
import { Card, Skeleton, StatCard } from '@/components/ui-kit';
import { BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AnalyticsData {
    totalSubmissions: number;
    thisWeekCount: number;
    lastWeekCount: number;
    weekOverWeekChange: number | null;
    avgFieldCompletionRate: number | null;
    submissionsTrend: Array<{ date: string; count: number }>;
    fieldAnalytics: Array<{
        id: string;
        type: string;
        label: string;
        stats: {
            totalResponses: number;
            type: string;
            distribution?: Array<{ name: string; value: number }>;
            average?: number;
            avgResponseLength?: number;
            topAnswers?: Array<{ value: string; count: number }>;
            recentValues?: string[];
        };
    }>;
}

interface AnalyticsDashboardProps {
    formId: string;
}

const COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f97316', '#8b5cf6', '#14b8a6'];

export function AnalyticsDashboard({ formId }: AnalyticsDashboardProps) {
    const { toast } = useToast();

    const { data, isLoading, error } = useQuery<AnalyticsData>({
        queryKey: ['forms', formId, 'analytics'],
        queryFn: async () => {
            const response = await fetch(`/api/v2/forms/${formId}/analytics`);
            if (!response.ok) {
                throw new Error('Failed to fetch analytics');
            }
            return response.json();
        },
    });

    useEffect(() => {
        if (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to load analytics',
            });
        }
    }, [error, toast]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Skeleton className="h-28 w-full rounded-[12px]" />
                    <Skeleton className="h-28 w-full rounded-[12px]" />
                    <Skeleton className="h-28 w-full rounded-[12px]" />
                </div>
                <Skeleton className="h-72 w-full rounded-[12px]" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="rounded-[12px] border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
                No analytics data available.
            </div>
        );
    }

    const wowLabel = data.weekOverWeekChange === null
        ? 'vs last week: n/a'
        : data.weekOverWeekChange >= 0
            ? `↑ ${data.weekOverWeekChange}% vs last week`
            : `↓ ${Math.abs(data.weekOverWeekChange)}% vs last week`;

    const metrics = [
        {
            label: 'Total submissions',
            value: String(data.totalSubmissions),
            delta: `${data.thisWeekCount} this week · ${wowLabel}`,
        },
        {
            label: 'Questions tracked',
            value: String(data.fieldAnalytics.length),
            delta: 'Fields with response data',
        },
        {
            label: 'Avg field completion',
            value: data.avgFieldCompletionRate !== null ? `${data.avgFieldCompletionRate}%` : '—',
            delta: data.avgFieldCompletionRate !== null ? 'Avg % of fields filled per submission' : 'No submissions yet',
        },
    ];

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            <div className="grid gap-4 md:grid-cols-3">
                {metrics.map((metric) => (
                    <StatCard
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        delta={metric.delta}
                    />
                ))}
            </div>

            <Card icon={BarChart3} title="Submission trend" meta="Daily responses across the last 30 days.">
                <div className="h-[320px] rounded-xl border bg-muted/30 p-3 mx-5 mb-5">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.submissionsTrend}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(str) => {
                                    const date = new Date(str);
                                    return `${date.getMonth() + 1}/${date.getDate()}`;
                                }}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                allowDecimals={false}
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <RechartsTooltip
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: '1px solid hsl(var(--border))',
                                    boxShadow: '0 12px 24px rgba(15, 23, 42, 0.08)'
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="count"
                                stroke="#2563eb"
                                strokeWidth={2}
                                activeDot={{ r: 6 }}
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight">Question analysis</h2>
                <p className="text-xs text-muted-foreground">{data.fieldAnalytics.length} tracked fields</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {data.fieldAnalytics.map((field) => (
                    <div key={field.id} className="flex min-h-[280px] flex-col rounded-[16px] border bg-card p-5 shadow-sm">
                        <div>
                            <h3 className="line-clamp-2 text-base font-semibold" title={field.label}>
                                {field.label}
                            </h3>
                        </div>

                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{field.stats.totalResponses} responses</span>
                            {field.type === 'formRating' && field.stats.average && (
                                <span className="font-medium text-foreground">Avg: {field.stats.average}</span>
                            )}
                            {field.stats.avgResponseLength !== undefined && field.stats.avgResponseLength > 0 && (
                                <span>Avg length: {field.stats.avgResponseLength} chars</span>
                            )}
                        </div>

                        <div className="mt-4 flex-1 rounded-xl border bg-muted/30 p-4">
                            {field.stats.distribution && field.stats.distribution.length > 0 ? (
                                <div className="h-[200px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={field.stats.distribution} layout="vertical" margin={{ left: 0, right: 30 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                                            <XAxis type="number" fontSize={11} hide />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={100}
                                                fontSize={11}
                                                tickFormatter={(val) => val.length > 15 ? `${val.substring(0, 15)}...` : val}
                                            />
                                            <RechartsTooltip
                                                cursor={{ fill: 'transparent' }}
                                                contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                                            />
                                            <Bar dataKey="value" fill="#8884d8" radius={[0, 4, 4, 0]}>
                                                {field.stats.distribution.map((entry, index) => (
                                                    <Cell key={`cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : field.stats.topAnswers && field.stats.topAnswers.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                        Top answers
                                    </p>
                                    {field.stats.topAnswers.map((item) => (
                                        <div key={item.value} className="flex items-center justify-between gap-2 rounded-[12px] border bg-card px-3 py-2 text-sm">
                                            <span className="truncate">{item.value}</span>
                                            <span className="shrink-0 text-xs text-muted-foreground">{item.count}×</span>
                                        </div>
                                    ))}
                                </div>
                            ) : field.stats.recentValues && field.stats.recentValues.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                        Recent answers
                                    </p>
                                    {field.stats.recentValues.map((val, i) => (
                                        <div key={i} className="truncate rounded-[12px] border bg-card px-3 py-2 text-sm transition-colors hover:border-border">
                                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
