'use client';

import React from 'react';
import useSWR from 'swr';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Banner, Card, Chip, type ChipTone } from '@/components/ui-kit';
import {
    CheckCircle2,
    XCircle,
    Clock,
    ChevronRight,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ExecutionStep {
    status: string;
    nodeId?: string;
    nodeName?: string;
    duration?: number;
    output?: unknown;
    error?: string;
    [key: string]: unknown;
}

interface Execution {
    _id: string;
    status: string;
    createdAt: string;
    completedAt?: string;
    steps?: ExecutionStep[];
    [key: string]: unknown;
}

interface ExecutionLogsViewerProps {
    workflowId?: string;
}

export function ExecutionLogsViewer({ workflowId }: ExecutionLogsViewerProps) {
    const [selectedExecution, setSelectedExecution] = React.useState<Execution | null>(null);

    const { data: executionsData, isLoading } = useSWR(
        workflowId
            ? `/api/whatsapp/workflows/executions?workflowId=${workflowId}`
            : '/api/whatsapp/workflows/executions',
        fetcher,
        { refreshInterval: 5000 }
    );

    const { data: executionDetails } = useSWR(
        selectedExecution ? `/api/whatsapp/workflows/executions/${selectedExecution._id}` : null,
        fetcher,
        {
            refreshInterval: (data) => {
                // If the execution is running, refresh every 2 seconds
                // Checks either current data or the selected execution initial state
                const status = data?.execution?.status || selectedExecution?.status;
                return status === 'running' ? 2000 : 0;
            }
        }
    );

    const executions = executionsData?.executions || [];
    const execution = executionDetails?.execution || selectedExecution;

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="size-4 text-success" />;
            case 'failed':
                return <XCircle className="size-4 text-destructive" />;
            case 'running':
                return <Loader2 className="size-4 text-info animate-spin" />;
            default:
                return <Clock className="size-4 text-muted-foreground" />;
        }
    };

    const getStatusChipTone = (status: string): ChipTone => {
        const tones: Record<string, ChipTone> = {
            completed: 'ok',
            failed: 'danger',
            running: 'info',
            paused: 'warn',
        };
        return tones[status] || 'gray';
    };

    const getStepStatusIcon = (status: string) => {
        switch (status) {
            case 'success':
                return <CheckCircle2 className="size-5 text-success" />;
            case 'failed':
                return <XCircle className="size-5 text-destructive" />;
            default:
                return <AlertCircle className="size-5 text-warning" />;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-3 gap-6 h-[calc(100vh-200px)]">
            {/* Executions List */}
            <Card title="Execution History" meta={`${executions.length} execution${executions.length !== 1 ? 's' : ''}`} className="col-span-1">
                <ScrollArea className="h-[calc(100vh-320px)]">
                    <div className="space-y-2">
                        {executions.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">
                                No executions yet
                            </div>
                        ) : (
                            executions.map((exec: Execution) => (
                                <div
                                    key={exec._id}
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                        'cursor-pointer transition-all p-4 rounded-lg border border-border hover:bg-muted',
                                        selectedExecution?._id === exec._id &&
                                        'ring-2 ring-primary bg-muted'
                                    )}
                                    onClick={() => setSelectedExecution(exec)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedExecution(exec); } }}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            {getStatusIcon(exec.status)}
                                            <div>
                                                <div className="text-sm font-medium">
                                                    {new Date(exec.createdAt).toLocaleString()}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {exec.steps?.length || 0} steps
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight className="size-4 text-muted-foreground" />
                                    </div>
                                    <div className="mt-2">
                                        <Chip tone={getStatusChipTone(exec.status)}>
                                            {exec.status.charAt(0).toUpperCase() + exec.status.slice(1)}
                                        </Chip>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </Card>

            {/* Execution Details */}
            <Card
                title="Execution Details"
                meta={execution ? `Started: ${new Date(execution.createdAt).toLocaleString()}` : undefined}
                className="col-span-2"
            >
                {!execution ? (
                    <div className="text-center text-muted-foreground py-12">
                        Select an execution to view details
                    </div>
                ) : (
                    <ScrollArea className="h-[calc(100vh-320px)]">
                        <div className="space-y-6">
                            {/* Status Overview */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <div className="text-sm text-muted-foreground">Status</div>
                                    <div className="mt-1">
                                        <Chip tone={getStatusChipTone(execution.status)}>
                                            {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                                        </Chip>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Total Steps</div>
                                    <div className="mt-1 text-lg font-semibold">
                                        {execution.steps?.length || 0}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Duration</div>
                                    <div className="mt-1 text-lg font-semibold">
                                        {execution.completedAt
                                            ? `${Math.round(
                                                (new Date(execution.completedAt).getTime() -
                                                    new Date(execution.createdAt).getTime()) / 1000
                                            )}s`
                                            : 'Running...'}
                                    </div>
                                </div>
                            </div>

                            <Separator />

                            {/* Variables */}
                            {execution.variables &&
                                Object.keys(execution.variables).length > 0 && (
                                    <>
                                        <div>
                                            <h3 className="text-sm font-semibold mb-3">Variables</h3>
                                            <div className="bg-muted rounded-lg p-4 space-y-2">
                                                {Object.entries(execution.variables).map(
                                                    ([key, value]) => (
                                                        <div key={key} className="flex justify-between text-sm">
                                                            <span className="font-mono text-muted-foreground">{key}</span>
                                                            <span className="font-mono">{String(value)}</span>
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                        <Separator />
                                    </>
                                )}

                            {/* Execution Steps */}
                            <div>
                                <h3 className="text-sm font-semibold mb-3">Execution Steps</h3>
                                <div className="space-y-4">
                                    {execution.steps?.map((step: ExecutionStep, index: number) => (
                                        <div key={step.nodeId ?? step.nodeName ?? index} className="p-4 border border-border rounded-lg">
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5">
                                                    {getStepStatusIcon(step.status)}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="font-medium">{step.nodeName}</div>
                                                        <Chip tone="gray">{step.duration}ms</Chip>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        Node ID: {step.nodeId}
                                                    </div>

                                                    {/* Output */}
                                                    {step.output ? (
                                                        <div className="mt-3 bg-muted rounded p-3">
                                                            <div className="text-xs font-medium mb-2">Output:</div>
                                                            <pre className="text-xs overflow-x-auto">
                                                                {JSON.stringify(step.output, null, 2)}
                                                            </pre>
                                                        </div>
                                                    ) : null}

                                                    {/* Error */}
                                                    {step.error && (
                                                        <div className="mt-3">
                                                            <Banner tone="danger" title="Step Error">
                                                                {step.error}
                                                            </Banner>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Error Message */}
                            {execution.error && (
                                <>
                                    <Separator />
                                    <Banner tone="danger" title="Execution Failed">
                                        {String(execution.error)}
                                    </Banner>
                                </>
                            )}
                        </div>
                    </ScrollArea>
                )}
            </Card>
        </div>
    );
}
