'use client';

import React, { useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, GripVertical, Image as ImageIcon, Users, AlertCircle, PanelRightClose, CalendarDays, Repeat2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Chip, Segmented } from '@/components/ui-kit';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    filterDraftSidebarItems,
    type DraftSidebarFilter,
} from '@/lib/social/draft-sidebar';

interface Draft {
    id: string;
    brandId: string;
    title: string;
    content: string;
    mediaCount: number;
    platformCount: number;
    lastEditedAt: string;
    createdAt: string;
    scheduleCount: number;
    isScheduled: boolean;
    isRepeatedPost: boolean;
    activeScheduledPostId: string | null;
}

interface DraftsSidebarProps {
    brandId: string;
    className?: string;
    onDraftsLoaded?: (drafts: Draft[]) => void;
    onToggleCollapse?: () => void;
}

const DraggableDraftCard = ({ draft }: { draft: Draft }) => {
    const isDisabled = draft.isScheduled;

    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `draft-${draft.id}`,
        data: {
            type: 'draft',
            draft,
        },
        disabled: isDisabled,
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 9999, // Ensure it floats above everything
    } : undefined;

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={cn(
            "group relative transition-all duration-200",
            isDisabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
            isDragging ? "opacity-50 scale-95 shadow-2xl" : !isDisabled ? "hover:scale-[1.02] hover:-translate-y-0.5" : "opacity-85"
        )}>
            <Card className={cn(
                "border-border/50 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden transition-all",
                isDisabled
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "hover:shadow-md hover:border-primary/30"
            )}>
                <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                        <div className={cn(
                            "text-muted-foreground/30 mt-1 transition-colors",
                            isDisabled ? "text-amber-500/50" : "cursor-grab active:cursor-grabbing group-hover:text-primary/50"
                        )}>
                            <GripVertical className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm truncate leading-tight mb-1">{draft.title}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-2">
                                {draft.content || <span className="italic opacity-50">No content...</span>}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                {draft.isScheduled && (
                                    <Chip tone="warn" icon={CalendarDays} className="h-5 text-[10px]">
                                        Scheduled
                                    </Chip>
                                )}
                                {draft.isRepeatedPost && (
                                    <Chip tone="info" icon={Repeat2} className="h-5 text-[10px]">
                                        Repeated Post
                                    </Chip>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {draft.mediaCount > 0 && (
                                    <Chip tone="gray" icon={ImageIcon} className="h-5 text-[10px]">
                                        {draft.mediaCount}
                                    </Chip>
                                )}
                                {draft.platformCount > 0 && (
                                    <Chip tone="gray" icon={Users} className="h-5 text-[10px]">
                                        {draft.platformCount}
                                    </Chip>
                                )}
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                    {formatDistanceToNow(new Date(draft.lastEditedAt), { addSuffix: true })}
                                </span>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export const DraftsSidebar = ({ brandId, className, onDraftsLoaded, onToggleCollapse }: DraftsSidebarProps) => {
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [filter, setFilter] = useState<DraftSidebarFilter>('all');

    const { isOver, setNodeRef } = useDroppable({
        id: 'drafts-sidebar-droppable',
        data: {
            type: 'sidebar',
        },
    });

    useEffect(() => {
        const handleRefresh = () => setRefreshTrigger(prev => prev + 1);
        window.addEventListener('refresh-drafts', handleRefresh);
        return () => window.removeEventListener('refresh-drafts', handleRefresh);
    }, []);

    useEffect(() => {
        if (!brandId || brandId === 'all') {
            setDrafts([]);
            setIsLoading(false);
            if (onDraftsLoaded) onDraftsLoaded([]);
            return;
        }

        async function fetchDrafts() {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/social/drafts?brandId=${brandId}&limit=20`);
                if (response.ok) {
                    const data = await response.json();
                    setDrafts(data.drafts || []);
                    if (onDraftsLoaded) onDraftsLoaded(data.drafts || []);
                }
            } catch (error) {
                console.error('Failed to fetch drafts for sidebar', error);
            } finally {
                setIsLoading(false);
            }
        }

        fetchDrafts();
    }, [brandId, refreshTrigger, onDraftsLoaded]);

    const visibleDrafts = filterDraftSidebarItems(drafts, filter);

    if (!brandId || brandId === 'all') {
        return (
            <div className={cn("flex flex-col h-full bg-card border rounded-xl overflow-hidden shadow-sm", className)}>
                <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="size-4 text-primary" /> Drafts
                    </h3>
                    {onToggleCollapse && (
                        <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={onToggleCollapse} title="Collapse Sidebar">
                            <PanelRightClose className="size-4" />
                        </Button>
                    )}
                </div>
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                    <AlertCircle className="size-8 mb-2 opacity-20" />
                    <p className="text-sm">Select a specific brand to view drafts.</p>
                </div>
            </div>
        );
    }

    return (
        <div 
           ref={setNodeRef}
           className={cn(
             "flex flex-col h-full bg-card border rounded-xl overflow-hidden shadow-sm transition-colors duration-300", 
             isOver ? "ring-2 ring-primary bg-primary/5" : "",
             className
           )}
        >
            <div className="p-4 border-b bg-muted/20 relative z-10 flex justify-between items-center group">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold flex items-center gap-2">
                            <FileText className="size-4 text-primary" /> Drafts
                        </h3>
                        <Chip tone="gray">{visibleDrafts.length}</Chip>
                    </div>
                    <Segmented
                        options={[
                            { value: 'all', label: 'All' },
                            { value: 'unscheduled', label: 'Unscheduled' },
                        ]}
                        value={filter}
                        onChange={(v) => setFilter(v as DraftSidebarFilter)}
                    />
                </div>
                {onToggleCollapse && (
                    <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={onToggleCollapse} title="Collapse Sidebar">
                        <PanelRightClose className="size-4" />
                    </Button>
                )}
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                    {isLoading ? (
                        [1, 2, 3, 4].map(i => (
                            <Skeleton key={i} className="h-24 w-full rounded-lg" />
                        ))
                    ) : visibleDrafts.length === 0 ? (
                        <div className="text-center py-10 opacity-60">
                            <FileText className="size-8 mx-auto mb-2 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">
                                {filter === 'unscheduled' ? 'No unscheduled drafts found.' : 'No drafts found.'}
                            </p>
                        </div>
                    ) : (
                         visibleDrafts.map(draft => (
                            <DraggableDraftCard key={draft.id} draft={draft} />
                        ))
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};
