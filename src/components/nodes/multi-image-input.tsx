'use client';

import Image from 'next/image';
import { Check, ArrowUp, ArrowDown, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface InputImage {
    id: string;
    url: string;
    sourceNodeId: string;
    handleId: string;
    selected: boolean;
}

interface MultiImageInputProps {
    images: InputImage[];
    onSelectionChange: (images: InputImage[]) => void;
    onReorder: (images: InputImage[]) => void;
    disabled?: boolean;
    maxSelection?: number;
    className?: string;
}

export const MultiImageInput = ({
    images,
    onSelectionChange,
    onReorder,
    disabled = false,
    maxSelection,
    className,
}: MultiImageInputProps) => {
    const selectedCount = images.filter(img => img.selected).length;

    const toggleSelection = (id: string) => {
        const updated = images.map(img => {
            if (img.id === id) {
                // Check max selection before selecting
                if (!img.selected && maxSelection && selectedCount >= maxSelection) {
                    return img; // Don't select if at max
                }
                return { ...img, selected: !img.selected };
            }
            return img;
        });
        onSelectionChange(updated);
    };

    const selectAll = () => {
        const limit = maxSelection || images.length;
        const updated = images.map((img, i) => ({
            ...img,
            selected: i < limit,
        }));
        onSelectionChange(updated);
    };

    const deselectAll = () => {
        const updated = images.map(img => ({ ...img, selected: false }));
        onSelectionChange(updated);
    };

    const moveImage = (index: number, direction: 'up' | 'down') => {
        const newImages = [...images];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex < 0 || targetIndex >= images.length) return;

        [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];
        onReorder(newImages);
    };

    if (images.length === 0) {
        return null;
    }

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                    <ImageIcon className="size-3" />
                    Input Images ({selectedCount}/{images.length})
                </Label>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={selectAll}
                        disabled={disabled}
                    >
                        All
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={deselectAll}
                        disabled={disabled}
                    >
                        None
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto p-1">
                {images.map((img, index) => (
                    <TooltipProvider key={img.id} delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    className={cn(
                                        'relative aspect-square rounded-md overflow-hidden cursor-pointer transition-all group',
                                        'border-2',
                                        img.selected
                                            ? 'border-primary ring-1 ring-primary/30'
                                            : 'border-transparent hover:border-muted-foreground/30',
                                        disabled && 'opacity-50 cursor-not-allowed'
                                    )}
                                    onClick={() => !disabled && toggleSelection(img.id)}
                                >
                                    <Image
                                        src={img.url}
                                        alt={`Input image ${index + 1}`}
                                        fill
                                        className="object-cover"
                                    />

                                    {/* Selection indicator */}
                                    {img.selected && (
                                        <div className="absolute top-0.5 right-0.5 bg-primary rounded-full p-0.5">
                                            <Check className="size-2.5 text-primary-foreground" />
                                        </div>
                                    )}

                                    {/* Index badge */}
                                    <div className="absolute bottom-0.5 left-0.5 bg-black/70 text-white text-[8px] px-1 py-0.5 rounded">
                                        {index + 1}
                                    </div>

                                    {/* Reorder buttons on hover */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-5 bg-white/80 hover:bg-white text-black"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                moveImage(index, 'up');
                                            }}
                                            disabled={disabled || index === 0}
                                        >
                                            <ArrowUp className="size-3" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-5 bg-white/80 hover:bg-white text-black"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                moveImage(index, 'down');
                                            }}
                                            disabled={disabled || index === images.length - 1}
                                        >
                                            <ArrowDown className="size-3" />
                                        </Button>
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="text-xs">
                                <p>From node: {img.sourceNodeId.slice(-6)}</p>
                                <p>Handle: {img.handleId}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ))}
            </div>

            {maxSelection && selectedCount > maxSelection && (
                <p className="text-[10px] text-amber-600">
                    Max {maxSelection} images can be selected
                </p>
            )}
        </div>
    );
};
