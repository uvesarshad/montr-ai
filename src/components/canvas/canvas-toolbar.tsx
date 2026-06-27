'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Image as ImageIcon,
    LayoutTemplate,
    MessageSquare,
    Share2,
    Sparkles,
    Save,
    History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { NodeCollectionDialog } from './dialogs/node-collection-dialog';
import { GalleryDialog } from './dialogs/gallery-dialog';
import { TemplateDialog } from './dialogs/template-dialog';
import { AIWorkflowDialog } from './dialogs/ai-workflow-dialog';
import { ShareAsTemplatePanel } from './share-as-template-panel';
import { CanvasVersionHistory } from './canvas-version-history';

import { useSidebar } from '@/components/sidebar-provider';
import type { Node, Edge } from 'reactflow';

export interface AnchorPoint {
    x: number;
    y: number;
}

interface CanvasToolbarProps {
    onAddNode: (type: string, data?: Record<string, unknown>) => void;
    onAddStickyNote: () => void;
    onSave?: () => void;
    isSaving?: boolean;
    onWorkflowGenerated?: (result: { nodes: Node[]; edges: Edge[] }) => void;
    /** Called with the restored canvas data (JSON string) so the editor can rehydrate. */
    onRestoreVersion?: (data: string) => void;
    canvasId?: string;
    canvasName?: string;
}

export function CanvasToolbar({
    onAddNode,
    onAddStickyNote,
    onSave,
    isSaving = false,
    onWorkflowGenerated,
    onRestoreVersion,
    canvasId,
    canvasName,
}: CanvasToolbarProps) {
    const { push: routerPush } = useRouter();
    const [isNodeDialogOpen, setIsNodeDialogOpen] = useState(false);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [isTemplateOpen, setIsTemplateOpen] = useState(false);
    const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
    const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const { isCollapsed } = useSidebar();

    // Refs for toolbar buttons to get their positions
    const nodeButtonRef = useRef<HTMLButtonElement>(null);
    const galleryButtonRef = useRef<HTMLButtonElement>(null);
    const templateButtonRef = useRef<HTMLButtonElement>(null);
    const aiButtonRef = useRef<HTMLButtonElement>(null);

    // Anchor points for dialogs (center of button in viewport)
    const [nodeAnchor, setNodeAnchor] = useState<AnchorPoint>({ x: 0, y: 0 });
    const [galleryAnchor, setGalleryAnchor] = useState<AnchorPoint>({ x: 0, y: 0 });
    const [templateAnchor, setTemplateAnchor] = useState<AnchorPoint>({ x: 0, y: 0 });
    const [aiAnchor, setAiAnchor] = useState<AnchorPoint>({ x: 0, y: 0 });

    const getButtonCenter = useCallback((ref: React.RefObject<HTMLButtonElement | null>): AnchorPoint => {
        if (ref.current) {
            const rect = ref.current.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return { x: 0, y: 0 };
    }, []);

    /**
     * Empty-canvas onboarding (TODO 2.15): the overlay rendered by the editor
     * dispatches `canvas-onboarding` events to open the toolbar's existing
     * dialogs. Anchored to the matching toolbar button so the dialog flies out
     * from the same origin as a manual click would.
     */
    useEffect(() => {
        const handleOnboarding = (e: Event) => {
            const action = (e as CustomEvent).detail?.action as string | undefined;
            switch (action) {
                case 'template':
                    setTemplateAnchor(getButtonCenter(templateButtonRef));
                    setIsTemplateOpen(true);
                    break;
                case 'ai':
                    setAiAnchor(getButtonCenter(aiButtonRef));
                    setIsAIDialogOpen(true);
                    break;
                case 'trigger':
                    setNodeAnchor(getButtonCenter(nodeButtonRef));
                    setIsNodeDialogOpen(true);
                    break;
                default:
                    break;
            }
        };
        window.addEventListener('canvas-onboarding', handleOnboarding);
        return () => window.removeEventListener('canvas-onboarding', handleOnboarding);
    }, [getButtonCenter]);

    const handleNodeSelect = (type: string, subType?: string) => {
        onAddNode(type, { subType });
        setIsNodeDialogOpen(false);
    };

    const handleImageSelect = async (imageUrl: string, source: 'library' | 'stock') => {
        try {
            // Import the fetchRemoteImage function
            const { fetchRemoteImage } = await import('@/ai/flows/fetch-remote-image-flow');

            // Fetch the image to get data URI
            const result = await fetchRemoteImage(imageUrl);

            if (result.success && result.dataUri) {
                // Extract filename from URL
                const urlFileName = imageUrl.substring(imageUrl.lastIndexOf('/') + 1).split('?')[0] || 'image';

                // Create image file object
                const imageFile = {
                    name: urlFileName,
                    url: imageUrl,
                    type: 'image',
                    previewUrl: result.dataUri,
                };

                // Add node with the image file
                onAddNode('imageNode', { files: [imageFile] });
            } else {
                console.error('Failed to fetch image:', result.error);
                // Fallback: create node with URL only
                onAddNode('imageNode', { imageUrl, source });
            }
        } catch (error) {
            console.error('Error fetching image:', error);
            // Fallback: create node with URL only
            onAddNode('imageNode', { imageUrl, source });
        }
        setIsGalleryOpen(false);
    };

    const handleTemplateInstall = (canvasId: string) => {
        setIsTemplateOpen(false);
        routerPush(`/canvas/${canvasId}`);
    };

    const handleWorkflowGenerated = (result: { nodes: Node[]; edges: Edge[] }) => {
        if (onWorkflowGenerated) {
            onWorkflowGenerated(result);
        }
    };

    return (
        <>
            <aside className="absolute top-1/2 -translate-y-1/2 left-6 z-10 hidden md:block">
                <TooltipProvider delayDuration={0}>
                    <div className="flex flex-col items-center gap-2 p-2 rounded-full bg-white/90 dark:bg-black/90 backdrop-blur-xl shadow-2xl dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)] border border-border/40">
                        {/* Add Node (Plus) */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    ref={nodeButtonRef}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setNodeAnchor(getButtonCenter(nodeButtonRef));
                                        setIsNodeDialogOpen(true);
                                    }}
                                    className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                    <Plus className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="ml-2 font-medium">
                                Add Node
                            </TooltipContent>
                        </Tooltip>

                        {/* Gallery */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    ref={galleryButtonRef}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setGalleryAnchor(getButtonCenter(galleryButtonRef));
                                        setIsGalleryOpen(true);
                                    }}
                                    className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                    <ImageIcon className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="ml-2 font-medium">
                                Gallery
                            </TooltipContent>
                        </Tooltip>

                        {/* Templates */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    ref={templateButtonRef}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setTemplateAnchor(getButtonCenter(templateButtonRef));
                                        setIsTemplateOpen(true);
                                    }}
                                    className="rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                                >
                                    <LayoutTemplate className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="ml-2 font-medium">
                                Templates
                            </TooltipContent>
                        </Tooltip>

                        {/* Comments (Sticky Notes) */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onAddStickyNote}
                                    className="rounded-full hover:bg-amber-500/10 hover:text-amber-600 transition-colors"
                                >
                                    <MessageSquare className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="ml-2 font-medium">
                                Comments
                            </TooltipContent>
                        </Tooltip>

                        {/* Share as Template */}
                        {canvasId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsSharePanelOpen(true)}
                                        className="rounded-full hover:bg-green-500/10 hover:text-green-600 transition-colors"
                                    >
                                        <Share2 className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="ml-2 font-medium">
                                    Share as Template
                                </TooltipContent>
                            </Tooltip>
                        )}

                        {/* AI Workflow Generator */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    ref={aiButtonRef}
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                        setAiAnchor(getButtonCenter(aiButtonRef));
                                        setIsAIDialogOpen(true);
                                    }}
                                    className="rounded-full hover:bg-purple-500/10 hover:text-purple-600 transition-colors"
                                >
                                    <Sparkles className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="ml-2 font-medium">
                                AI Generate
                            </TooltipContent>
                        </Tooltip>

                        {/* Version History */}
                        {canvasId && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsHistoryOpen(true)}
                                        className="rounded-full hover:bg-blue-500/10 hover:text-blue-600 transition-colors"
                                    >
                                        <History className="size-5 text-[#222222] dark:text-[#EDEADE]" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="ml-2 font-medium">
                                    Version History
                                </TooltipContent>
                            </Tooltip>
                        )}

                        {/* Save Button */}
                        {onSave && (
                            <>
                                <div className="w-6 h-px bg-border/30 my-1" />
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={onSave}
                                            disabled={isSaving}
                                            className="rounded-full hover:bg-green-500/10 hover:text-green-600 transition-colors"
                                        >
                                            <Save className={`size-5 text-[#222222] dark:text-[#EDEADE] ${isSaving ? 'animate-pulse' : ''}`} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="ml-2 font-medium">
                                        {isSaving ? 'Saving...' : 'Save Canvas'}
                                    </TooltipContent>
                                </Tooltip>
                            </>
                        )}
                    </div>
                </TooltipProvider>
            </aside>

            {/* Dialogs */}
            <NodeCollectionDialog
                open={isNodeDialogOpen}
                onOpenChange={setIsNodeDialogOpen}
                onSelectNode={handleNodeSelect}
                isCollapsed={isCollapsed}
                anchorPoint={nodeAnchor}
            />

            <GalleryDialog
                open={isGalleryOpen}
                onOpenChange={setIsGalleryOpen}
                onSelectImage={handleImageSelect}
                isCollapsed={isCollapsed}
                anchorPoint={galleryAnchor}
            />

            <TemplateDialog
                open={isTemplateOpen}
                onOpenChange={setIsTemplateOpen}
                onInstall={handleTemplateInstall}
                isCollapsed={isCollapsed}
                anchorPoint={templateAnchor}
            />

            <AIWorkflowDialog
                open={isAIDialogOpen}
                onOpenChange={setIsAIDialogOpen}
                onWorkflowGenerated={handleWorkflowGenerated}
                isCollapsed={isCollapsed}
                anchorPoint={aiAnchor}
            />

            {canvasId && (
                <ShareAsTemplatePanel
                    open={isSharePanelOpen}
                    onOpenChange={setIsSharePanelOpen}
                    canvasId={canvasId}
                    canvasName={canvasName}
                />
            )}

            {canvasId && (
                <CanvasVersionHistory
                    open={isHistoryOpen}
                    onOpenChange={setIsHistoryOpen}
                    canvasId={canvasId}
                    onRestored={(data) => onRestoreVersion?.(data)}
                />
            )}
        </>
    );
}
