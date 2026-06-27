'use client';

import { useRouter } from 'next/navigation';
import { Plus, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanvases } from '@/hooks/use-canvases-v2';
import { useSession } from '@/lib/auth-client';
import { useToast } from '@/hooks/use-toast';
import { CANVAS_LIMIT_PER_USER } from '@/lib/config';
import { Card } from '@/components/ui/card';

interface CreateCanvasCardProps {
    className?: string;
}

export function CreateCanvasCard({ className }: CreateCanvasCardProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const { toast } = useToast();
    const { canvases, isLoading: _isCanvasesLoading, createCanvas } = useCanvases();

    // Local loading state for the creation action
    const [isCreating, setIsCreating] = React.useState(false);

    const atCanvasLimit = canvases ? canvases.length >= CANVAS_LIMIT_PER_USER : false;

    const handleCreateCanvas = async () => {
        if (!session) {
            toast({
                variant: 'destructive',
                title: 'Authentication Error',
                description: 'You must be logged in to create a canvas.',
            });
            return;
        }

        if (atCanvasLimit) {
            toast({
                variant: 'destructive',
                title: 'Canvas Limit Reached',
                description: `You can only create up to ${CANVAS_LIMIT_PER_USER} canvases.`,
            });
            return;
        }

        try {
            setIsCreating(true);
            const newCanvas = await createCanvas('Untitled Canvas', JSON.stringify({ nodes: [], edges: [] }));
            router.push(`/canvas/${newCanvas._id}`);
        } catch (error: unknown) {
            console.error('Error creating canvas: ', error);
            toast({
                variant: 'destructive',
                title: 'Error creating canvas',
                description: error instanceof Error ? error.message : 'Failed to create canvas',
            });
            setIsCreating(false);
        }
    };

    return (
        <Card
            onClick={!isCreating && !atCanvasLimit ? handleCreateCanvas : undefined}
            className={cn(
                "group relative flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-6 overflow-hidden cursor-pointer transition-all duration-300",
                "border-2 border-dashed border-muted-foreground/25 bg-muted/5 hover:bg-muted/10 hover:border-primary/50 hover:shadow-lg",
                atCanvasLimit && "opacity-50 cursor-not-allowed hover:bg-muted/5 hover:border-muted-foreground/25 hover:shadow-none",
                className
            )}
        >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className={cn(
                "relative flex items-center justify-center size-16 rounded-full bg-primary/10 text-primary transition-transform duration-500 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground",
                isCreating && "animate-pulse"
            )}>
                {isCreating ? (
                    <Loader2 className="size-8 animate-spin" />
                ) : (
                    <Plus className="size-8" />
                )}
            </div>

            <div className="relative text-center space-y-1">
                <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                    Create New Canvas
                </h3>
                <p className="text-sm text-muted-foreground max-w-[200px]">
                    Start with a blank slate or use AI to generate content
                </p>
            </div>

            {!atCanvasLimit && (
                <div className="absolute bottom-4 right-4 opacity-0 transform translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <Sparkles className="size-5 text-primary/40" />
                </div>
            )}
        </Card>
    );
}

import React from 'react';
