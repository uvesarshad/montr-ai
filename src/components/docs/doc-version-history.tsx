'use client';

import React, { useState, useEffect } from 'react';
import { Button, EmptyState, Chip, Banner } from '@/components/ui-kit';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Clock, RotateCcw, Loader2, Save, AlertCircle, History } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

interface DocVersion {
    _id: string;
    version: number;
    title: string;
    createdBy: string;
    createdAt: string;
    isAutoSave: boolean;
    changeDescription?: string;
}

interface DocVersionHistoryProps {
    docId: string;
    onRestore?: (content: string, title: string) => void;
}

export function DocVersionHistory({ docId, onRestore }: DocVersionHistoryProps) {
    const [versions, setVersions] = useState<DocVersion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRestoring, setIsRestoring] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const { toast } = useToast();

    const fetchVersions = async () => {
        try {
            setIsLoading(true);
            const response = await fetch(`/api/docs/${docId}/versions`);
            if (!response.ok) throw new Error('Failed to fetch versions');
            const data = await response.json();
            setVersions(data.versions);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to load version history',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchVersions();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, docId]);

    const handleRestore = async (versionId: string) => {
        if (!confirm('Are you sure you want to restore this version? Your current changes will be backed up.')) {
            return;
        }

        try {
            setIsRestoring(versionId);
            const response = await fetch(`/api/docs/${docId}/versions/${versionId}/restore`, {
                method: 'POST',
            });

            if (!response.ok) throw new Error('Failed to restore version');

            const data = await response.json();

            toast({
                title: 'Success',
                description: 'Document restored successfully',
            });

            // Call onRestore callback if provided
            if (onRestore && data.doc) {
                onRestore(data.doc.content, data.doc.title);
            }

            // Refresh version list
            await fetchVersions();

            // Close dialog
            setIsOpen(false);

            // Reload page to show restored content
            window.location.reload();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to restore version',
            });
        } finally {
            setIsRestoring(null);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Clock className="size-4" />
                    History
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>Version History</DialogTitle>
                    <DialogDescription>
                        View and restore previous versions of this document
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                ) : versions.length === 0 ? (
                    <EmptyState
                        icon={History}
                        title="No version history yet"
                        note="Versions will be created automatically as you edit."
                    />
                ) : (
                    <>
                        <Banner tone="info" icon={AlertCircle} title="Restoring creates a backup of your current state" />

                        <ScrollArea className="h-[400px] pr-4">
                            <div className="space-y-2">
                                {versions.map((version, index) => (
                                    <div
                                        key={version._id}
                                        className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                    >
                                        {/* Timeline indicator */}
                                        <div className="flex flex-col items-center">
                                            <div className={`size-8 rounded-full flex items-center justify-center ${index === 0
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted text-muted-foreground'
                                                }`}>
                                                {version.isAutoSave ? (
                                                    <Save className="size-4" />
                                                ) : (
                                                    <span className="text-xs font-medium">v{version.version}</span>
                                                )}
                                            </div>
                                            {index < versions.length - 1 && (
                                                <div className="w-0.5 h-full bg-border mt-2" />
                                            )}
                                        </div>

                                        {/* Version info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-medium text-sm truncate">
                                                            {version.title}
                                                        </h4>
                                                        {index === 0 && (
                                                            <Chip tone="brand">Current</Chip>
                                                        )}
                                                        {version.isAutoSave && (
                                                            <Chip tone="gray">Auto-save</Chip>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
                                                    </p>
                                                    {version.changeDescription && (
                                                        <p className="text-xs text-muted-foreground mt-1 italic">
                                                            {version.changeDescription}
                                                        </p>
                                                    )}
                                                </div>

                                                {index !== 0 && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleRestore(version._id)}
                                                        disabled={isRestoring !== null}
                                                    >
                                                        {isRestoring === version._id ? (
                                                            <>
                                                                <Loader2 className="size-3 mr-1 animate-spin" />
                                                                Restoring...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <RotateCcw className="size-3 mr-1" />
                                                                Restore
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
