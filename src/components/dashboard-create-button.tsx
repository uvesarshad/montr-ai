'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Plus,
    Layout,
    FileText,
    Share2,
    ChevronDown,
    Loader2,
    Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
// import { collection, query, updateDoc } from 'firebase/firestore';
// import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

export function DashboardCreateButton() {
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();

    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState<string | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // TODO: Re-implement canvas limit check using API
    // const { data: canvases } = useCanvases();
    // const atCanvasLimit = canvases ? canvases.length >= CANVAS_LIMIT_PER_USER : false;

    const handleMouseEnter = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsOpen(true);
    };

    const handleMouseLeave = () => {
        timeoutRef.current = setTimeout(() => {
            setIsOpen(false);
        }, 150);
    };

    const handleCreateCanvas = async () => {
        if (!user) return; // using my new useUser
        // Simplified limit check: Let the backend enforce it or do a pre-fetch. 
        // For now, removing client-side limit check to unblock or assumes backend throws 403.
        /* if (atCanvasLimit) { ... } */

        setIsCreating('canvas');
        setIsOpen(false);
        try {
            const res = await fetch('/api/v2/canvases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Untitled Canvas',
                    data: '{"nodes":[],"edges":[]}'
                })
            });

            if (!res.ok) throw new Error('Failed to create canvas');

            const newCanvas = await res.json();
            // Assuming newCanvas has .id or ._id
            const id = newCanvas.id || newCanvas._id;
            router.push(`/canvas/${id}`);
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to create canvas',
            });
            setIsCreating(null);
        }
    };

    const handleCreateDocument = async () => {
        if (!user) return;

        setIsCreating('doc');
        setIsOpen(false);
        try {
            const res = await fetch('/api/v2/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'Untitled',
                    content: '',
                })
            });

            if (!res.ok) throw new Error('Failed to create document');

            const newDoc = await res.json();
            const id = newDoc.id || newDoc._id;
            router.push(`/docs/${id}`);
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to create document',
            });
            setIsCreating(null);
        }
    };

    const handleCreatePost = () => {
        setIsOpen(false);
        router.push('/social/create-post');
    };

    const handleCreateContact = () => {
        setIsOpen(false);
        router.push('/crm/contacts');
    };

    return (
        <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="relative inline-block"
        >
            <Button
                id="header-create-btn"
                variant="outline"
                size="sm"
                className="relative z-10 h-9 min-w-[116px] gap-2 rounded-[0.4rem] border-border/60 bg-background/80 px-3 text-foreground shadow-none transition-all duration-200 hover:border-primary/30 hover:bg-background"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="flex size-5 items-center justify-center rounded-[0.4rem] bg-primary/10 text-primary">
                    {isCreating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                </span>
                <span className="font-medium">Create</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Transparent bridge to prevent gap flickering */}
                        <div className="absolute top-full left-0 w-full h-4 z-20" />

                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 8, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute right-0 top-full z-30 w-72 rounded-[12px] border border-border/70 bg-popover/95 p-2 shadow-2xl backdrop-blur-xl"
                        >
                            <div
                                id="create-menu-canvas"
                                onClick={handleCreateCanvas}
                                className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-3 transition-all hover:bg-muted/70"
                            >
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-blue-500/20 bg-blue-500/10 text-blue-500">
                                    <Layout className="size-5" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-semibold">New Automation</span>
                                    <span className="text-[11px] leading-tight text-muted-foreground">Automate workflow</span>
                                </div>
                            </div>

                            <div
                                id="create-menu-post"
                                onClick={handleCreatePost}
                                className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-3 transition-all hover:bg-muted/70"
                            >
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-purple-500/20 bg-purple-500/10 text-purple-500">
                                    <Share2 className="size-5" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-semibold">Create Post</span>
                                    <span className="text-[11px] leading-tight text-muted-foreground">Plan social media content</span>
                                </div>
                            </div>

                            <div
                                id="create-menu-doc"
                                onClick={handleCreateDocument}
                                className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-3 transition-all hover:bg-muted/70"
                            >
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-green-500/20 bg-green-500/10 text-green-500">
                                    <FileText className="size-5" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-semibold">New Document</span>
                                    <span className="text-[11px] leading-tight text-muted-foreground">Write long-form content</span>
                                </div>
                            </div>

                            <div
                                id="create-menu-contact"
                                onClick={handleCreateContact}
                                className="flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-3 transition-all hover:bg-muted/70"
                            >
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[12px] border border-orange-500/20 bg-orange-500/10 text-orange-500">
                                    <Users className="size-5" />
                                </div>
                                <div className="flex flex-col gap-0.5">
                                    <span className="text-sm font-semibold">New Contact</span>
                                    <span className="text-[11px] leading-tight text-muted-foreground">Add a new contact to CRM</span>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
