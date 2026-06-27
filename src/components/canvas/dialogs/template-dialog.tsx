'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Star, Download, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCanvasTemplates } from '@/hooks/use-canvas-templates';
import { VerifiedBadge } from '../templates/verified-badge';
import type { AnchorPoint } from '../canvas-toolbar';

interface TemplateDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInstall: (canvasId: string) => void;
    isCollapsed: boolean;
    anchorPoint: AnchorPoint;
}

export function TemplateDialog({ open, onOpenChange, onInstall, isCollapsed, anchorPoint }: TemplateDialogProps) {
    const { toast } = useToast();
    const { templates, isLoading } = useCanvasTemplates();
    const [searchQuery, setSearchQuery] = useState('');
    const [isInstalling, setIsInstalling] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    const categories = [
        { id: 'all', name: 'All' },
        { id: 'marketing', name: 'Marketing' },
        { id: 'sales', name: 'Sales' },
        { id: 'automation', name: 'Automation' },
        { id: 'social-media', name: 'Social' },
        { id: 'customer-support', name: 'Support' },
        { id: 'ai-assistants', name: 'AI' },
    ];

    const handleInstall = async (templateId: string) => {
        setIsInstalling(templateId);

        try {
            const response = await fetch(`/api/v2/canvas-templates/${templateId}`, {
                method: 'POST',
                credentials: 'include',
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to install template');
            }

            const data = await response.json();
            onInstall(data.canvas.id);
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to install template:', error);
            toast({
                variant: 'destructive',
                title: 'Template install failed',
                description: error instanceof Error ? error.message : 'Failed to install template',
            });
        } finally {
            setIsInstalling(null);
        }
    };

    const filteredTemplates = templates.filter((template) => {
        const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
        const matchesSearch =
            !searchQuery ||
            template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            template.description.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesCategory && matchesSearch;
    });

    const difficultyColors = {
        beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
        advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    } as const;

    const dialogTop = 80;
    const dialogLeft = isCollapsed ? 152 : 352;
    const originX = anchorPoint.x - dialogLeft;
    const originY = anchorPoint.y - dialogTop;

    return (
        <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
            <DialogContent
                className={cn(
                    'flex h-[calc(100vh-10rem)] max-w-[320px] flex-col gap-0 overflow-hidden rounded-[28px] border border-border/40 bg-white/95 p-0 shadow-2xl backdrop-blur-xl dark:bg-black/95 dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)]',
                    'top-[5rem] translate-x-0 translate-y-0 duration-300 data-[state=open]:!animate-in data-[state=open]:!fade-in-0 data-[state=open]:!slide-in-from-left-0 data-[state=open]:!slide-in-from-top-0 data-[state=open]:!zoom-in-0',
                    isCollapsed ? 'left-[9.5rem]' : 'left-[22rem]'
                )}
                style={{ transformOrigin: `${originX}px ${originY}px` }}
                onPointerDownOutside={(e) => e.preventDefault()}
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <DialogHeader className="px-4 pt-4 pb-2">
                    <DialogTitle className="text-lg font-semibold">Templates</DialogTitle>
                </DialogHeader>
                <div className="flex flex-1 flex-col overflow-hidden px-4 pb-4">
                    <div className="relative mb-3 flex-shrink-0">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search templates..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 w-full rounded-full border-border/40 bg-background/50 pl-9"
                        />
                    </div>

                    <div className="mb-3 -mx-1 flex flex-shrink-0 gap-1.5 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        {categories.map((category) => (
                            <button
                                type="button"
                                key={category.id}
                                onClick={() => setSelectedCategory(category.id)}
                                className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedCategory === category.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                                    }`}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="flex flex-1 items-center justify-center">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : filteredTemplates.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-sm text-muted-foreground">
                            <p>No templates found</p>
                            <p className="mt-1 text-xs text-muted-foreground/60">Try adjusting your search or category</p>
                        </div>
                    ) : (
                        <ScrollArea className="flex-1 -mr-2 pr-2" style={{ maxHeight: 'calc(100vh - 16rem)' }}>
                            <div className="space-y-2">
                                {filteredTemplates.map((template) => (
                                    <div
                                        key={template._id}
                                        className="rounded-xl border border-border/40 bg-muted/30 p-3 transition-colors hover:bg-muted/50"
                                    >
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
                                                    {template.name}
                                                </h3>
                                                {template.isOfficial && <VerifiedBadge />}
                                            </div>
                                            {template.isFeatured ? (
                                                <Star className="size-3.5 flex-shrink-0 fill-yellow-500 text-yellow-500" />
                                            ) : null}
                                        </div>

                                        <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                                            {template.description}
                                        </p>

                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5">
                                                <Badge
                                                    variant="secondary"
                                                    className={`px-1.5 py-0 text-[10px] ${difficultyColors[template.difficulty]}`}
                                                >
                                                    {template.difficulty}
                                                </Badge>
                                                <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                                    <Download className="size-3" />
                                                    <span>{template.usageCount}</span>
                                                </div>
                                            </div>

                                            <Button
                                                size="sm"
                                                onClick={() => handleInstall(template._id)}
                                                disabled={isInstalling === template._id}
                                                className="h-7 rounded-full px-3 text-xs"
                                            >
                                                {isInstalling === template._id ? (
                                                    <>
                                                        <Loader2 className="mr-1 size-3 animate-spin" />
                                                        Installing...
                                                    </>
                                                ) : (
                                                    'Use'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}

                    <div className="mt-3 flex-shrink-0 border-t border-border/40 pt-3">
                        <Link
                            href="/canvas/templates"
                            onClick={() => onOpenChange(false)}
                            className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ExternalLink className="size-3" />
                            Browse all templates
                        </Link>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
