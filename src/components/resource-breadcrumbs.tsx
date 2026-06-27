
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
    label: string;
    id: string | null;
}

interface ResourceBreadcrumbsProps {
    items: BreadcrumbItem[];
    onNavigate: (id: string | null) => void;
    className?: string;
}

export function ResourceBreadcrumbs({
    items,
    onNavigate,
    className,
}: ResourceBreadcrumbsProps) {
    if (!items || items.length === 0) return null;

    return (
        <div className={cn("flex items-center gap-1.5 overflow-hidden", className)}>
            {items.map((item, index) => {
                const isLast = index === items.length - 1;

                return (
                    <React.Fragment key={item.id ?? 'root'}>
                        {index > 0 && (
                            <ChevronRight className="size-4 text-muted-foreground/50 flex-shrink-0" />
                        )}

                        {isLast ? (
                            <h1 className="text-lg font-semibold text-foreground truncate">{item.label}</h1>
                        ) : (
                            <button
                                onClick={() => onNavigate(item.id)}
                                className="text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px] flex items-center cursor-pointer"
                                type="button"
                            >
                                {item.label}
                            </button>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}
