'use client';

import { BadgeCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VerifiedBadgeProps {
    size?: 'sm' | 'md';
    className?: string;
}

export function VerifiedBadge({ size = 'sm', className }: VerifiedBadgeProps) {
    const iconSize = size === 'md' ? 'size-4' : 'size-3.5';

    return (
        <TooltipProvider delayDuration={0}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className={className}>
                        <BadgeCheck className={`${iconSize} text-blue-500`} aria-label="Official template" />
                    </span>
                </TooltipTrigger>
                <TooltipContent>
                    <p className="text-xs">Official Montr AI template</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
