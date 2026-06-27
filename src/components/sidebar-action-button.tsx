'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface SidebarActionButtonProps {
    label: string;
    onClick?: (e: React.MouseEvent) => void;
    href?: string;
    className?: string;
}

export function SidebarActionButton({ label, onClick, href, className }: SidebarActionButtonProps) {
    const buttonClass = cn(
        "size-6 mr-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-muted-foreground hover:text-primary hover:bg-muted",
        className
    );

    if (href) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    <Link href={href} onClick={onClick}>
                        <Button variant="ghost" size="icon" className={buttonClass}>
                            <PlusCircle className="size-4" />
                            <span className="sr-only">{label}</span>
                        </Button>
                    </Link>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
            </Tooltip>
        );
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={buttonClass} onClick={onClick}>
                    <PlusCircle className="size-4" />
                    <span className="sr-only">{label}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}
