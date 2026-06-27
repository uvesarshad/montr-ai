'use client';

import { ReactNode, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParameterGroupProps {
    title: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    children: ReactNode;
    className?: string;
}

export const ParameterGroup = ({
    title,
    collapsible = false,
    defaultOpen = true,
    children,
    className,
}: ParameterGroupProps) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={cn('space-y-2 p-3 border rounded-lg bg-muted/30', className)}>
            <div
                className={cn(
                    'flex items-center gap-1.5 font-medium text-xs text-muted-foreground uppercase tracking-wide',
                    collapsible && 'cursor-pointer select-none hover:text-foreground transition-colors'
                )}
                onClick={() => collapsible && setIsOpen(!isOpen)}
            >
                {collapsible && (
                    isOpen
                        ? <ChevronDown className="size-3.5" />
                        : <ChevronRight className="size-3.5" />
                )}
                <span>{title}</span>
            </div>
            {isOpen && <div className="space-y-3 pt-1">{children}</div>}
        </div>
    );
};
