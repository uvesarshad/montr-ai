'use client';

import React, { useEffect, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  AlertCircle,
  Minus,
  Wifi,
} from 'lucide-react';
import { format } from 'date-fns';
import { useExecutionUpdates } from '@/hooks/use-socket';

interface ExecutionStep {
  nodeId: string;
  nodeName?: string;
  timestamp: Date;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  input?: unknown;
  output?: unknown;
  error?: string;
  errorStack?: string;
  duration?: number;
  retryCount?: number;
  variables?: Record<string, unknown>;
}

interface Execution {
  _id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  executionPath: ExecutionStep[];
  error?: string;
  errorStack?: string;
  metadata?: unknown;
}

interface ExecutionDetailProps {
  execution: Execution;
}

export function ExecutionDetail({ execution: initialExecution }: ExecutionDetailProps) {
  const [openSteps, setOpenSteps] = React.useState<Record<string, boolean>>({});
  const [execution, setExecution] = useState(initialExecution);

  // Real-time WebSocket updates for this specific execution
  const { execution: realtimeExecution, steps: realtimeSteps, isConnected } = useExecutionUpdates(
    execution._id
  );

  // Merge real-time updates into execution
  useEffect(() => {
    if (realtimeExecution) {
      setExecution((prev) => ({
        ...prev,
        ...(realtimeExecution as Partial<Execution>),
      } as Execution));
    }
  }, [realtimeExecution]);

  // Merge real-time steps into execution path
  useEffect(() => {
    if (realtimeSteps.length > 0) {
      setExecution((prev) => {
        const existingSteps = prev.executionPath || [];
        const merged = [...existingSteps];

        realtimeSteps.forEach((newStep) => {
          const step = newStep as ExecutionStep;
          const existingIndex = merged.findIndex((s) => s.nodeId === step.nodeId);
          if (existingIndex >= 0) {
            merged[existingIndex] = { ...merged[existingIndex], ...step };
          } else {
            merged.push({ ...step, timestamp: step.timestamp ?? new Date() });
          }
        });

        return {
          ...prev,
          executionPath: merged,
        };
      });
    }
  }, [realtimeSteps]);

  // Update from prop changes
  useEffect(() => {
    setExecution(initialExecution);
  }, [initialExecution]);

  const toggleStep = (nodeId: string) => {
    setOpenSteps((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="size-5 text-green-600" />;
      case 'failed':
        return <XCircle className="size-5 text-red-600" />;
      case 'running':
        return <PlayCircle className="size-5 text-blue-600" />;
      case 'pending':
        return <Clock className="size-5 text-gray-400" />;
      case 'skipped':
        return <Minus className="size-5 text-gray-400" />;
      default:
        return <AlertCircle className="size-5 text-gray-400" />;
    }
  };

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
      case 'skipped':
        return <Badge variant="outline">Skipped</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (ms: number | undefined) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="space-y-6">
      {/* Execution Summary */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Execution Summary</h3>
            {isConnected && execution.status === 'running' && (
              <Badge variant="secondary" className="gap-1">
                <Wifi className="size-3" />
                Live
              </Badge>
            )}
          </div>
          {getStatusBadge(execution.status)}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-600 mb-1">Started</div>
            <div className="font-medium">
              {format(new Date(execution.startedAt), 'MMM d, HH:mm:ss')}
            </div>
          </div>
          {execution.completedAt && (
            <div>
              <div className="text-gray-600 mb-1">Completed</div>
              <div className="font-medium">
                {format(new Date(execution.completedAt), 'MMM d, HH:mm:ss')}
              </div>
            </div>
          )}
          <div>
            <div className="text-gray-600 mb-1">Duration</div>
            <div className="font-medium">{formatDuration(execution.duration)}</div>
          </div>
          <div>
            <div className="text-gray-600 mb-1">Steps</div>
            <div className="font-medium">{execution.executionPath?.length || 0}</div>
          </div>
        </div>

        {execution.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <XCircle className="size-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-red-900 mb-1">Error</div>
                <div className="text-sm text-red-800">{execution.error}</div>
                {execution.errorStack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-red-700 hover:underline">
                      View Stack Trace
                    </summary>
                    <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-x-auto">
                      {execution.errorStack}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Execution Path */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Execution Path</h3>
          <p className="text-sm text-gray-600 mt-1">
            Detailed log of each step in the workflow execution
          </p>
        </div>

        <ScrollArea className="max-h-[600px]">
          <div className="p-4 space-y-2">
            {execution.executionPath && execution.executionPath.length > 0 ? (
              execution.executionPath.map((step, index) => (
                <Collapsible
                  key={step.nodeId}
                  open={openSteps[step.nodeId]}
                  onOpenChange={() => toggleStep(step.nodeId)}
                >
                  <div
                    className={`border rounded-lg overflow-hidden ${
                      step.status === 'failed' ? 'border-red-300' : 'border-gray-200'
                    }`}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors">
                        <div className="flex-shrink-0 size-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>

                        {getStatusIcon(step.status)}

                        <div className="flex-1 text-left min-w-0">
                          <div className="font-medium truncate">
                            {step.nodeName || step.nodeId}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center gap-2">
                            <span>
                              {format(new Date(step.timestamp), 'HH:mm:ss.SSS')}
                            </span>
                            {step.duration !== undefined && (
                              <>
                                <span>•</span>
                                <span>{formatDuration(step.duration)}</span>
                              </>
                            )}
                            {step.retryCount !== undefined && step.retryCount > 0 && (
                              <>
                                <span>•</span>
                                <Badge variant="outline" className="text-xs">
                                  Retry {step.retryCount}
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>

                        {openSteps[step.nodeId] ? (
                          <ChevronDown className="size-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="size-5 text-gray-400" />
                        )}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="border-t bg-gray-50 p-4 space-y-4">
                        {/* Input */}
                        {step.input !== undefined && step.input !== null && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Input
                            </div>
                            <pre className="text-xs bg-white border rounded p-3 overflow-x-auto">
                              {JSON.stringify(step.input, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Output */}
                        {step.output !== undefined && step.output !== null && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Output
                            </div>
                            <pre className="text-xs bg-white border rounded p-3 overflow-x-auto">
                              {JSON.stringify(step.output, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Error */}
                        {step.error && (
                          <div>
                            <div className="text-sm font-medium text-red-700 mb-2">
                              Error
                            </div>
                            <div className="text-sm bg-red-50 border border-red-200 rounded p-3">
                              {step.error}
                            </div>
                            {step.errorStack && (
                              <details className="mt-2">
                                <summary className="cursor-pointer text-xs text-red-700 hover:underline">
                                  View Stack Trace
                                </summary>
                                <pre className="mt-2 text-xs bg-red-100 border border-red-200 rounded p-3 overflow-x-auto">
                                  {step.errorStack}
                                </pre>
                              </details>
                            )}
                          </div>
                        )}

                        {/* Variables */}
                        {step.variables && Object.keys(step.variables).length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">
                              Variables
                            </div>
                            <pre className="text-xs bg-white border rounded p-3 overflow-x-auto">
                              {JSON.stringify(step.variables, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No execution steps recorded
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
