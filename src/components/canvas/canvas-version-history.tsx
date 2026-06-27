'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, RotateCcw, Save, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button, Chip, Banner, Spinner, EmptyState } from '@/components/ui-kit';
import { ConfirmDialog } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface CanvasVersion {
    _id: string;
    version: number;
    saveKind: 'manual' | 'auto';
    label?: string | null;
    createdAt: string;
}

interface CanvasVersionHistoryProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    canvasId: string;
    /** Called with the restored canvas data (JSON string) so the editor can rehydrate. */
    onRestored: (data: string) => void;
}

export function CanvasVersionHistory({
    open,
    onOpenChange,
    canvasId,
    onRestored,
}: CanvasVersionHistoryProps) {
    const [versions, setVersions] = useState<CanvasVersion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchVersions = useCallback(async () => {
        try {
            setIsLoading(true);
            const res = await fetch(`/api/v2/canvases/${canvasId}/versions`, {
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to fetch versions');
            const data = await res.json();
            setVersions(data.versions || []);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to load version history',
            });
        } finally {
            setIsLoading(false);
        }
    }, [canvasId, toast]);

    useEffect(() => {
        if (open) fetchVersions();
    }, [open, fetchVersions]);

    const handleRestore = useCallback(
        async (versionId: string) => {
            const res = await fetch(
                `/api/v2/canvases/${canvasId}/versions/${versionId}/restore`,
                { method: 'POST', credentials: 'include' }
            );
            if (!res.ok) {
                toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to restore version',
                });
                throw new Error('restore failed');
            }
            const data = await res.json();
            toast({ title: 'Restored', description: 'Canvas restored from version.' });
            if (data.data) onRestored(data.data as string);
            onOpenChange(false);
        },
        [canvasId, onRestored, onOpenChange, toast]
    );

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <History className="size-4" />
                            Version history
                        </SheetTitle>
                        <SheetDescription>
                            Restore an earlier snapshot of this canvas. Restoring backs up the current state first.
                        </SheetDescription>
                    </SheetHeader>

                    {isLoading ? (
                        <div className="flex flex-1 items-center justify-center">
                            <Spinner size={20} />
                        </div>
                    ) : versions.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center">
                            <EmptyState
                                icon={Clock}
                                title="No versions yet"
                                note="Snapshots are captured automatically as you edit and on every manual save."
                            />
                        </div>
                    ) : (
                        <ScrollArea className="-mx-1 mt-2 flex-1 px-1">
                            <div className="space-y-2 pb-4">
                                {versions.map((v, index) => (
                                    <div
                                        key={v._id}
                                        className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                                    >
                                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                                            {v.saveKind === 'auto' ? (
                                                <Save className="size-4" />
                                            ) : (
                                                <span className="text-xs font-medium">v{v.version}</span>
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    Version {v.version}
                                                </span>
                                                {index === 0 && <Chip>Latest</Chip>}
                                                <Chip>{v.saveKind === 'auto' ? 'Auto' : 'Manual'}</Chip>
                                            </div>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                {formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                                            </p>
                                            {v.label && (
                                                <p className="mt-1 text-xs italic text-muted-foreground">
                                                    {v.label}
                                                </p>
                                            )}
                                        </div>
                                        {index !== 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                icon={RotateCcw}
                                                onClick={() => setConfirmId(v._id)}
                                            >
                                                Restore
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    {versions.length > 0 && (
                        <Banner tone="info" className="mt-2">
                            Restoring creates a backup of your current canvas first.
                        </Banner>
                    )}
                </SheetContent>
            </Sheet>

            <ConfirmDialog
                open={confirmId !== null}
                onOpenChange={(o) => !o && setConfirmId(null)}
                title="Restore this version?"
                description="Your current canvas will be backed up, then replaced with this snapshot."
                confirmLabel="Restore"
                destructive={false}
                onConfirm={() => (confirmId ? handleRestore(confirmId) : undefined)}
            />
        </>
    );
}
