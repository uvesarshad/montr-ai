'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Status of a single node's execution
 */
export interface NodeExecutionStatus {
    status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
    progress: number; // 0-100
    message: string;
    startTime: number | null;
    endTime: number | null;
    error: string | null;
}

/**
 * Overall execution state for a workflow
 */
interface ExecutionState {
    isExecuting: boolean;
    nodeStatuses: Map<string, NodeExecutionStatus>;
    totalNodes: number;
    completedNodes: number;
}

interface ExecutionContextValue {
    state: ExecutionState;
    /** Start execution tracking for a node */
    startNodeExecution: (nodeId: string, message?: string) => void;
    /** Update progress for a running node */
    updateNodeProgress: (nodeId: string, progress: number, message?: string) => void;
    /** Mark a node as completed */
    completeNodeExecution: (nodeId: string) => void;
    /** Mark a node as failed */
    failNodeExecution: (nodeId: string, error: string) => void;
    /** Reset a node's status to idle */
    resetNodeStatus: (nodeId: string) => void;
    /** Reset all execution state */
    resetAll: () => void;
    /** Get status for a specific node */
    getNodeStatus: (nodeId: string) => NodeExecutionStatus | undefined;
}

const defaultNodeStatus: NodeExecutionStatus = {
    status: 'idle',
    progress: 0,
    message: '',
    startTime: null,
    endTime: null,
    error: null,
};

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

export const ExecutionProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<ExecutionState>({
        isExecuting: false,
        nodeStatuses: new Map(),
        totalNodes: 0,
        completedNodes: 0,
    });

    const startNodeExecution = useCallback((nodeId: string, message = 'Starting...') => {
        setState((prev) => {
            const newStatuses = new Map(prev.nodeStatuses);
            newStatuses.set(nodeId, {
                status: 'running',
                progress: 0,
                message,
                startTime: Date.now(),
                endTime: null,
                error: null,
            });

            return {
                ...prev,
                isExecuting: true,
                nodeStatuses: newStatuses,
            };
        });
    }, []);

    const updateNodeProgress = useCallback((nodeId: string, progress: number, message?: string) => {
        setState((prev) => {
            const newStatuses = new Map(prev.nodeStatuses);
            const current = newStatuses.get(nodeId) || { ...defaultNodeStatus };

            newStatuses.set(nodeId, {
                ...current,
                progress: Math.min(100, Math.max(0, progress)),
                message: message || current.message,
            });

            return {
                ...prev,
                nodeStatuses: newStatuses,
            };
        });
    }, []);

    const completeNodeExecution = useCallback((nodeId: string) => {
        setState((prev) => {
            const newStatuses = new Map(prev.nodeStatuses);
            const current = newStatuses.get(nodeId) || { ...defaultNodeStatus };

            newStatuses.set(nodeId, {
                ...current,
                status: 'completed',
                progress: 100,
                message: 'Completed',
                endTime: Date.now(),
                error: null,
            });

            const completedCount = Array.from(newStatuses.values()).filter(
                (s) => s.status === 'completed'
            ).length;

            const anyRunning = Array.from(newStatuses.values()).some(
                (s) => s.status === 'running' || s.status === 'pending'
            );

            return {
                ...prev,
                nodeStatuses: newStatuses,
                completedNodes: completedCount,
                isExecuting: anyRunning,
            };
        });
    }, []);

    const failNodeExecution = useCallback((nodeId: string, error: string) => {
        setState((prev) => {
            const newStatuses = new Map(prev.nodeStatuses);
            const current = newStatuses.get(nodeId) || { ...defaultNodeStatus };

            newStatuses.set(nodeId, {
                ...current,
                status: 'failed',
                message: 'Failed',
                endTime: Date.now(),
                error,
            });

            const anyRunning = Array.from(newStatuses.values()).some(
                (s) => s.status === 'running' || s.status === 'pending'
            );

            return {
                ...prev,
                nodeStatuses: newStatuses,
                isExecuting: anyRunning,
            };
        });
    }, []);

    const resetNodeStatus = useCallback((nodeId: string) => {
        setState((prev) => {
            const newStatuses = new Map(prev.nodeStatuses);
            newStatuses.delete(nodeId);

            return {
                ...prev,
                nodeStatuses: newStatuses,
            };
        });
    }, []);

    const resetAll = useCallback(() => {
        setState({
            isExecuting: false,
            nodeStatuses: new Map(),
            totalNodes: 0,
            completedNodes: 0,
        });
    }, []);

    const getNodeStatus = useCallback((nodeId: string) => {
        return state.nodeStatuses.get(nodeId);
    }, [state.nodeStatuses]);

    return (
        <ExecutionContext.Provider
            value={{
                state,
                startNodeExecution,
                updateNodeProgress,
                completeNodeExecution,
                failNodeExecution,
                resetNodeStatus,
                resetAll,
                getNodeStatus,
            }}
        >
            {children}
        </ExecutionContext.Provider>
    );
};

/**
 * Hook to access execution context
 */
export const useExecution = () => {
    const context = useContext(ExecutionContext);
    if (!context) {
        throw new Error('useExecution must be used within an ExecutionProvider');
    }
    return context;
};

/**
 * Hook for individual nodes to manage their own execution status
 */
export const useNodeExecution = (nodeId: string) => {
    const {
        startNodeExecution,
        updateNodeProgress,
        completeNodeExecution,
        failNodeExecution,
        resetNodeStatus,
        getNodeStatus,
    } = useExecution();

    const status = getNodeStatus(nodeId);

    return {
        status: status?.status || 'idle',
        progress: status?.progress || 0,
        message: status?.message || '',
        error: status?.error || null,
        isRunning: status?.status === 'running',
        isCompleted: status?.status === 'completed',
        isFailed: status?.status === 'failed',
        start: (message?: string) => startNodeExecution(nodeId, message),
        updateProgress: (progress: number, message?: string) => updateNodeProgress(nodeId, progress, message),
        complete: () => completeNodeExecution(nodeId),
        fail: (error: string) => failNodeExecution(nodeId, error),
        reset: () => resetNodeStatus(nodeId),
    };
};
