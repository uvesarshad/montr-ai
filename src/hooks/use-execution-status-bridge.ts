'use client';

import { useEffect, useRef } from 'react';
import { useExecutionUpdates } from '@/hooks/use-socket';
import { useExecution } from '@/contexts/execution-context';

/**
 * Bridge live execution step events into the canvas ExecutionContext (audit
 * H13). The engine already emits `execution:step` / `execution:failed` over
 * Socket.IO (carrying nodeId + status + error); `useExecutionUpdates` surfaces
 * them. This hook translates each step into the per-node context calls
 * (`startNodeExecution` / `completeNodeExecution` / `failNodeExecution`) so
 * NodeShell's `NodeExecutionGlow` lights up the running / completed / failed
 * node in real time, and so a failing node can be surfaced in its config panel.
 *
 * Pass the currently running executionId (or null when idle). Returns nothing —
 * it only drives the shared context.
 */
export function useExecutionStatusBridge(executionId: string | null) {
    const { steps, execution } = useExecutionUpdates(executionId);
    const {
        startNodeExecution,
        completeNodeExecution,
        failNodeExecution,
    } = useExecution();

    // Track which (nodeId,status) pairs we've already applied so re-renders
    // don't re-fire context updates for the same step.
    const appliedRef = useRef<Set<string>>(new Set());

    // Reset the applied-set whenever we start watching a new execution.
    useEffect(() => {
        appliedRef.current = new Set();
    }, [executionId]);

    useEffect(() => {
        if (!executionId) return;
        for (const step of steps) {
            const key = `${step.nodeId}:${step.status}`;
            if (appliedRef.current.has(key)) continue;
            appliedRef.current.add(key);

            switch (step.status) {
                case 'running':
                    startNodeExecution(step.nodeId, step.nodeName || 'Running…');
                    break;
                case 'success':
                    completeNodeExecution(step.nodeId);
                    break;
                case 'failed':
                    failNodeExecution(step.nodeId, step.error || 'Node failed');
                    break;
                default:
                    break;
            }
        }
    }, [steps, executionId, startNodeExecution, completeNodeExecution, failNodeExecution]);

    // When the whole run fails with an errorNodeId but no per-node failed step
    // arrived (e.g. terminal failure outside a node), mark that node too.
    useEffect(() => {
        if (!executionId || !execution) return;
        const errorNodeId = (execution as { errorNodeId?: string }).errorNodeId;
        if (execution.status === 'failed' && errorNodeId) {
            const key = `${errorNodeId}:failed`;
            if (!appliedRef.current.has(key)) {
                appliedRef.current.add(key);
                failNodeExecution(
                    errorNodeId,
                    (execution as { error?: string }).error || 'Node failed'
                );
            }
        }
    }, [execution, executionId, failNodeExecution]);
}
