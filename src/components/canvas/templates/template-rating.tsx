'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplateRatingProps {
    rating: number;
    ratingCount?: number;
    size?: 'sm' | 'md' | 'lg';
    interactive?: boolean;
    value?: number;
    onChange?: (rating: number) => void;
    className?: string;
}

export function TemplateRating({
    rating,
    ratingCount,
    size = 'sm',
    interactive = false,
    value,
    onChange,
    className,
}: TemplateRatingProps) {
    const starSize = size === 'lg' ? 'size-5' : size === 'md' ? 'size-4' : 'size-3.5';
    const textSize = size === 'lg' ? 'text-sm' : 'text-[11px]';
    const displayRating = interactive ? (value ?? 0) : rating;

    const stars = [1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.floor(displayRating);
        const half = !filled && star === Math.ceil(displayRating) && displayRating % 1 >= 0.5;

        return (
            <button
                key={star}
                type="button"
                disabled={!interactive}
                onClick={() => interactive && onChange?.(star)}
                className={cn(
                    'transition-transform',
                    interactive && 'cursor-pointer hover:scale-110',
                    !interactive && 'cursor-default'
                )}
            >
                <Star
                    className={cn(
                        starSize,
                        filled || half
                            ? 'fill-amber-400 text-amber-400'
                            : 'fill-transparent text-muted-foreground/40'
                    )}
                />
            </button>
        );
    });

    return (
        <span className={cn('inline-flex items-center gap-1', className)}>
            <span className="inline-flex items-center gap-0.5">{stars}</span>
            {!interactive && (
                <span className={cn(textSize, 'font-medium text-foreground')}>
                    {rating > 0 ? rating.toFixed(1) : 'New'}
                </span>
            )}
            {ratingCount !== undefined && ratingCount > 0 && (
                <span className={cn(textSize, 'text-muted-foreground')}>({ratingCount})</span>
            )}
        </span>
    );
}
