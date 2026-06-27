'use client';

import React, { memo, useState, useCallback } from 'react';
import {
    Play,
    StopCircle,
    RotateCcw,
    History,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useExecution } from '@/contexts/execution-context';
import { useToast } from '@/hooks/use-toast';
import { useExecutionStatusBridge } from '@/hooks/use-execution-status-bridge';
import { ExecutionDetail } from '@/components/workflow/execution-detail';

interface ExecutionHistory {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: string;
    completedAt?: string;
    error?: string;
    steps: number;
}

interface CanvasExecutionControlProps {
    canvasId: string;
}

function getStatusColor(status: string) {
    switch (status) {
        case 'completed':
            return 'bg-green-500/10 text-green-600 border-green-200';
        case 'failed':
            return 'bg-red-500/10 text-red-600 border-red-200';
        case 'running':
            return 'bg-blue-500/10 text-blue-600 border-blue-200';
        case 'cancelled':
            return 'bg-gray-500/10 text-gray-600 border-gray-300';
        default:
            return 'bg-gray-500/10 text-gray-600 border-gray-200';
    }
}

function getStatusIcon(status: string) {
    switch (status) {
        case 'completed':
            return <CheckCircle2 className="size-4 text-green-500" />;
        case 'failed':
            return <XCircle className="size-4 text-red-500" />;
        case 'running':
            return <Loader2 className="size-4 text-blue-500 animate-spin" />;
        default:
            return <Clock className="size-4 text-gray-500" />;
    }
}

interface ExecutionHistoryListProps {
    executions: ExecutionHistory[];
    onSelect: (executionId: string) => void;
}

function ExecutionHistoryList({ executions, onSelect }: ExecutionHistoryListProps) {
    return (
        <div className="space-y-3">
            {executions.map((exec) => (
                <button
                    type="button"
                    key={exec.id}
                    onClick={() => onSelect(exec.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors hover:brightness-95 ${getStatusColor(exec.status)}`}
                >
                    <div className="flex items-center gap-2 mb-2">
                        {getStatusIcon(exec.status)}
                        <Badge variant="outline" className="text-xs capitalize">
                            {exec.status}
                        </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Started: {new Date(exec.startedAt).toLocaleString()}
                    </p>
                    {exec.completedAt && (
                        <p className="text-xs text-muted-foreground">
                            Completed: {new Date(exec.completedAt).toLocaleString()}
                        </p>
                    )}
                    <p className="text-xs mt-1">{exec.steps} steps</p>
                    {exec.error && (
                        <p className="text-xs text-red-600 mt-1">{exec.error}</p>
                    )}
                </button>
            ))}
        </div>
    );
}

function CanvasExecutionControl({ canvasId }: CanvasExecutionControlProps) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionHistory, setExecutionHistory] = useState<ExecutionHistory[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    // Id of the run currently being tracked (for live node-status + stop) and
    // the run opened in the detail viewer from the history list.
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    // Full execution record opened in the detail viewer from the history list.
    const [detailExecution, setDetailExecution] = useState<Record<string, unknown> | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);
    const { state, resetAll } = useExecution();
    const { toast } = useToast();

    // Bridge live step events for the running execution into the node context so
    // running / completed / failed nodes light up on the canvas in real time.
    useExecutionStatusBridge(currentExecutionId);

    const executeCanvas = useCallback(async () => {
        if (isExecuting) return;

        try {
            setIsExecuting(true);
            resetAll();

            // wait=false → return as soon as the run is enqueued/started so we
            // can track it live over Socket.IO instead of blocking the request
            // until the run finishes.
            const response = await fetch(`/api/v2/canvases/${canvasId}/execute?wait=false`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ triggerData: { manual: true } }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Execution failed');
            }

            const result = await response.json();

            toast({
                title: 'Execution Started',
                description: 'Workflow is running…',
            });

            // The inline path returns the executionId directly. The queued path
            // returns only a jobId, so resolve the newest execution via GET.
            let executionId: string | undefined = result.executionId;
            if (!executionId) {
                executionId = await resolveLatestExecutionId();
            }
            if (executionId) {
                setCurrentExecutionId(executionId);
                pollExecutionStatus(executionId);
            }
        } catch (error) {
            toast({
                title: 'Execution Failed',
                description: error instanceof Error ? error.message : String(error),
                variant: 'destructive',
            });
            setIsExecuting(false);
        }
        // pollExecutionStatus / resolveLatestExecutionId are declared below and stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasId, isExecuting, resetAll, toast]);

    // Find the most recent execution for this canvas (used when the queued path
    // gives us only a jobId).
    const resolveLatestExecutionId = useCallback(async (): Promise<string | undefined> => {
        try {
            const response = await fetch(`/api/v2/canvases/${canvasId}/execute`);
            if (!response.ok) return undefined;
            const data = await response.json();
            const newest = data.executions?.[0];
            return newest?.id ? String(newest.id) : undefined;
        } catch {
            return undefined;
        }
    }, [canvasId]);

    const pollExecutionStatus = useCallback(async (executionId: string) => {
        // Socket events drive the per-node visuals; this poll only resolves the
        // terminal toast + run-finished state (covers the no-Redis dev path too).
        const poll = async () => {
            try {
                const response = await fetch(`/api/v2/canvases/${canvasId}/execute`);
                if (response.ok) {
                    const data = await response.json();
                    const currentExec = data.executions?.find((e: { id: string }) => e.id === executionId);

                    if (currentExec) {
                        if (currentExec.status === 'completed') {
                            toast({
                                title: 'Execution Complete',
                                description: `Completed ${currentExec.steps} steps successfully`,
                            });
                            setIsExecuting(false);
                            return;
                        } else if (currentExec.status === 'failed') {
                            toast({
                                title: 'Execution Failed',
                                description: currentExec.error || 'Unknown error',
                                variant: 'destructive',
                            });
                            setIsExecuting(false);
                            return;
                        } else if (currentExec.status === 'cancelled') {
                            setIsExecuting(false);
                            return;
                        }
                    }

                    // Still running, poll again.
                    setTimeout(poll, 2000);
                }
            } catch (error) {
                console.error('Poll error:', error);
            }
        };

        poll();
    }, [canvasId, toast]);

    const stopExecution = useCallback(async () => {
        if (!currentExecutionId) {
            setIsExecuting(false);
            resetAll();
            return;
        }
        try {
            const res = await fetch(
                `/api/v2/canvases/${canvasId}/executions/${currentExecutionId}`,
                { method: 'DELETE' }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to stop execution');
            }
            toast({
                title: 'Stopping Execution',
                description: 'The workflow will halt at its next node boundary.',
            });
        } catch (error) {
            toast({
                title: 'Stop Failed',
                description: error instanceof Error ? error.message : String(error),
                variant: 'destructive',
            });
        } finally {
            setIsExecuting(false);
        }
    }, [canvasId, currentExecutionId, resetAll, toast]);

    const loadHistory = useCallback(async () => {
        try {
            setIsLoadingHistory(true);
            const response = await fetch(`/api/v2/canvases/${canvasId}/execute`);
            if (response.ok) {
                const data = await response.json();
                setExecutionHistory(data.executions || []);
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [canvasId]);

    // Open the faithful per-step viewer for a run picked from the history list.
    const openExecutionDetail = useCallback(async (executionId: string) => {
        setIsLoadingDetail(true);
        setDetailExecution(null);
        try {
            const res = await fetch(`/api/v2/canvases/${canvasId}/executions/${executionId}`);
            if (res.ok) {
                const data = await res.json();
                setDetailExecution(data.execution || null);
            }
        } catch (error) {
            console.error('Failed to load execution detail:', error);
        } finally {
            setIsLoadingDetail(false);
        }
    }, [canvasId]);

    return (
        <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
            <TooltipProvider>
                <div className="flex items-center gap-2 p-2 rounded-full bg-background/80 backdrop-blur-xl border border-border/40 shadow-xl">
                    {/* Run Button */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className={`size-9 rounded-full ${isExecuting
                                        ? 'bg-green-500/10 text-green-600'
                                        : 'hover:bg-green-500/10 hover:text-green-600'
                                    }`}
                                onClick={executeCanvas}
                                disabled={isExecuting}
                            >
                                {isExecuting ? (
                                    <Loader2 className="size-5 animate-spin" />
                                ) : (
                                    <Play className="size-5" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {isExecuting ? 'Running...' : 'Run Workflow'}
                        </TooltipContent>
                    </Tooltip>

                    {/* Stop Button */}
                    {isExecuting && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-9 rounded-full hover:bg-red-500/10 hover:text-red-600"
                                    onClick={stopExecution}
                                >
                                    <StopCircle className="size-5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Stop Execution</TooltipContent>
                        </Tooltip>
                    )}

                    {/* Reset Button */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 rounded-full hover:bg-amber-500/10 hover:text-amber-600"
                                onClick={resetAll}
                                disabled={isExecuting}
                            >
                                <RotateCcw className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reset</TooltipContent>
                    </Tooltip>

                    {/* History Button */}
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-9 rounded-full hover:bg-primary/10"
                                onClick={loadHistory}
                            >
                                <History className="size-4" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="sm:max-w-xl w-full">
                            <SheetHeader>
                                <SheetTitle>
                                    {detailExecution || isLoadingDetail ? (
                                        <button
                                            type="button"
                                            className="text-sm text-primary hover:underline"
                                            onClick={() => {
                                                setDetailExecution(null);
                                                setIsLoadingDetail(false);
                                            }}
                                        >
                                            ← Back to history
                                        </button>
                                    ) : (
                                        'Execution History'
                                    )}
                                </SheetTitle>
                            </SheetHeader>
                            <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
                                {detailExecution || isLoadingDetail ? (
                                    isLoadingDetail ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                        </div>
                                    ) : detailExecution ? (
                                        <ExecutionDetail
                                            execution={detailExecution as unknown as React.ComponentProps<typeof ExecutionDetail>['execution']}
                                        />
                                    ) : null
                                ) : isLoadingHistory ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : executionHistory.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <History className="size-12 mx-auto mb-2 opacity-50" />
                                        <p>No execution history</p>
                                    </div>
                                ) : (
                                    <ExecutionHistoryList
                                        executions={executionHistory}
                                        onSelect={openExecutionDetail}
                                    />
                                )}
                            </ScrollArea>
                        </SheetContent>
                    </Sheet>
                </div>

                {/* Execution Progress Indicator */}
                {state.isExecuting && (
                    <div className="px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-200/50 text-blue-600 text-sm font-medium flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        <span>
                            {state.completedNodes}/{state.totalNodes} nodes
                        </span>
                    </div>
                )}
            </TooltipProvider>
        </div>
    );
}

export default memo(CanvasExecutionControl);
