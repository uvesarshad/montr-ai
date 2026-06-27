'use client';

import { useMemo } from 'react';
import { useNodeExecution } from '@/contexts/execution-context';

/**
 * Hook that provides styling and status info for execution visualization on nodes.
 * Returns className strings to apply to node containers for visual feedback.
 */
export function useNodeExecutionStatus(nodeId: string) {
    const nodeExecution = useNodeExecution(nodeId);

    const borderClass = useMemo(() => {
        switch (nodeExecution.status) {
            case 'running':
                return 'ring-2 ring-blue-500 ring-offset-1';
            case 'completed':
                return 'ring-2 ring-green-500 ring-offset-1';
            case 'failed':
                return 'ring-2 ring-red-500 ring-offset-1';
            case 'pending':
                return 'ring-2 ring-amber-400 ring-offset-1';
            default:
                return '';
        }
    }, [nodeExecution.status]);

    const statusIcon = useMemo(() => {
        switch (nodeExecution.status) {
            case 'running':
                return '⏳';
            case 'completed':
                return '✓';
            case 'failed':
                return '✗';
            case 'pending':
                return '⏸';
            default:
                return null;
        }
    }, [nodeExecution.status]);

    return {
        ...nodeExecution,
        borderClass,
        statusIcon,
    };
}
