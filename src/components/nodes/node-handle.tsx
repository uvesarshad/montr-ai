'use client';

import React from 'react';
import { Handle, HandleProps, Position } from 'reactflow';
import { cn } from '@/lib/utils';
import { themeFor, type NodeCategory, CATEGORY_THEME } from './node-categories';

export type HandleTone = 'default' | 'success' | 'danger' | 'info';

const TONE_FILL: Record<HandleTone, string | null> = {
    default: null,        // use category accent
    success: '#10B981',   // emerald — true / each-item
    danger:  '#EF4444',   // red — false
    info:    '#0EA5E9',   // sky — loop body / secondary path
};

export interface NodeHandleProps extends Omit<HandleProps, 'className' | 'style'> {
    /**
     * Either pass `nodeType` to derive accent from the category map,
     * or pass `accent` directly to override (e.g. branch's true/false).
     */
    nodeType?: string;
    accent?: string;
    /** Tinted variants for nodes with multiple outputs. */
    tone?: HandleTone;
    /** Inline-style override (e.g. handle vertical position). */
    style?: React.CSSProperties;
    className?: string;
    /** Optional inline label rendered next to the handle (e.g. "TRUE"). */
    label?: React.ReactNode;
    labelClassName?: string;
}

/**
 * Unified handle: 14px round, 2px ring, accent-colored, hover scale + ring.
 * Replaces the legacy HANDLE_STYLES.* presets and the per-node inline classes.
 */
export const NodeHandle = React.forwardRef<HTMLDivElement, NodeHandleProps>(
    ({ nodeType, accent, tone = 'default', style, className, label, labelClassName, position, type, ...rest }, _ref) => {
        const resolvedAccent =
            accent ??
            (tone !== 'default' ? TONE_FILL[tone] : null) ??
            themeFor(nodeType).accent;

        const isSource = type === 'source';
        const offsetClass =
            position === Position.Right ? '!-right-[7px]' :
            position === Position.Left ? '!-left-[7px]' :
            position === Position.Top ? '!-top-[7px]' :
            position === Position.Bottom ? '!-bottom-[7px]' :
            '';

        return (
            <Handle
                {...rest}
                type={type}
                position={position}
                className={cn(
                    '!w-3.5 !h-3.5 !rounded-full !border-2 !border-white dark:!border-black',
                    'transition-[transform,box-shadow] duration-150 ease-out',
                    'hover:!scale-150',
                    '!z-50',
                    offsetClass,
                    className,
                )}
                style={{
                    background: resolvedAccent,
                    boxShadow: `0 0 0 0 ${resolvedAccent}33`,
                    ...style,
                }}
            >
                {label && (
                    <span
                        className={cn(
                            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap',
                            isSource ? 'right-full mr-2' : 'left-full ml-2',
                            labelClassName,
                        )}
                        style={{ color: resolvedAccent }}
                    >
                        {label}
                    </span>
                )}
            </Handle>
        );
    },
);

NodeHandle.displayName = 'NodeHandle';

/** Re-export for callers that want to pass an accent directly. */
export { CATEGORY_THEME };
export type { NodeCategory };

export default NodeHandle;
