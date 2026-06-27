'use client';

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, FlaskConical } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';

export interface TestStepResult {
    nodeId: string;
    output?: unknown;
    error?: string;
    durationMs?: number;
    dryRun?: boolean;
    usedUpstream?: string[];
}

interface TestStepResultDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    loading: boolean;
    nodeLabel?: string;
    result: TestStepResult | null;
}

/**
 * 1.9 "Test this step" result panel. Lightweight dialog showing the single-node
 * test output (or error). Side effects are simulated when dryRun is on.
 */
export default function TestStepResultDialog({
    open,
    onOpenChange,
    loading,
    nodeLabel,
    result,
}: TestStepResultDialogProps) {
    const isError = !!result?.error;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FlaskConical className="size-4 text-brand" />
                        Test step{nodeLabel ? `: ${nodeLabel}` : ''}
                    </DialogTitle>
                    <DialogDescription>
                        Runs this node once with upstream sample / last-run data.
                        {result?.dryRun ? ' Sends are simulated (dry-run).' : ''}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Running…
                    </div>
                ) : result ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                            {isError ? (
                                <span className="flex items-center gap-1.5 text-destructive">
                                    <AlertCircle className="size-4" /> Failed
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="size-4" /> Success
                                </span>
                            )}
                            {typeof result.durationMs === 'number' && (
                                <span className="text-xs text-muted-foreground">· {result.durationMs}ms</span>
                            )}
                            {result.usedUpstream && result.usedUpstream.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    · upstream: {result.usedUpstream.length}
                                </span>
                            )}
                        </div>
                        <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-words">
                            {isError
                                ? result.error
                                : JSON.stringify(result.output ?? null, null, 2)}
                        </pre>
                    </div>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
