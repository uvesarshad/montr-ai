'use client';

import React, { memo } from 'react';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useNodeExecution } from '@/contexts/execution-context';
import { cn } from '@/lib/utils';

interface NodeExecutionIndicatorProps {
    nodeId: string;
    className?: string;
}

function NodeExecutionIndicator({ nodeId, className }: NodeExecutionIndicatorProps) {
    const { status, progress, message, isRunning, isCompleted, isFailed } = useNodeExecution(nodeId);

    // Only show when there's an active status
    if (status === 'idle') {
        return null;
    }

    return (
        <div
            className={cn(
                'absolute -top-2 -right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shadow-lg',
                isRunning && 'bg-blue-500 text-white',
                isCompleted && 'bg-green-500 text-white',
                isFailed && 'bg-red-500 text-white',
                status === 'pending' && 'bg-amber-500 text-white',
                className
            )}
        >
            {isRunning && (
                <>
                    <Loader2 className="size-3 animate-spin" />
                    <span className="max-w-[80px] truncate">{message || `${progress}%`}</span>
                </>
            )}
            {isCompleted && (
                <>
                    <CheckCircle2 className="size-3" />
                    <span>Done</span>
                </>
            )}
            {isFailed && (
                <>
                    <XCircle className="size-3" />
                    <span>Failed</span>
                </>
            )}
            {status === 'pending' && (
                <>
                    <AlertCircle className="size-3" />
                    <span>Pending</span>
                </>
            )}
        </div>
    );
}

export default memo(NodeExecutionIndicator);

// Progress ring for nodes that support it
export const NodeProgressRing = memo(function NodeProgressRing({
    nodeId,
    size = 40,
    strokeWidth = 3,
}: {
    nodeId: string;
    size?: number;
    strokeWidth?: number;
}) {
    const { isRunning, progress } = useNodeExecution(nodeId);

    if (!isRunning) return null;

    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <svg width={size} height={size} className="absolute -rotate-90">
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted-foreground/20"
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-300"
                />
            </svg>
        </div>
    );
});

// On-node error banner — surfaces the failure message on the node that failed
// during the last run (audit H13), so the user sees WHY without opening logs.
export const NodeErrorBanner = memo(function NodeErrorBanner({
    nodeId,
}: {
    nodeId: string;
}) {
    const { isFailed, error } = useNodeExecution(nodeId);

    if (!isFailed || !error) return null;

    return (
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full z-20 w-max max-w-[260px] pointer-events-none">
            <div className="flex items-start gap-1.5 rounded-lg bg-red-600 text-white text-[11px] leading-snug px-2.5 py-1.5 shadow-lg">
                <XCircle className="size-3.5 mt-px shrink-0" />
                <span className="line-clamp-3">{error}</span>
            </div>
        </div>
    );
});

// Execution border glow effect for nodes
export const NodeExecutionGlow = memo(function NodeExecutionGlow({
    nodeId,
}: {
    nodeId: string;
}) {
    const { status, isRunning, isCompleted, isFailed } = useNodeExecution(nodeId);

    if (status === 'idle') return null;

    return (
        <div
            className={cn(
                'absolute inset-0 rounded-xl pointer-events-none transition-all duration-300',
                isRunning && 'ring-2 ring-blue-500/50 animate-pulse',
                isCompleted && 'ring-2 ring-green-500/50',
                isFailed && 'ring-2 ring-red-500/50',
                status === 'pending' && 'ring-2 ring-amber-500/50'
            )}
        />
    );
});
