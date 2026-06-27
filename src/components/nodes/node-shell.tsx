'use client';

import React, { memo, useCallback } from 'react';
import { NodeResizer, Position, useStore } from 'reactflow';
import NodeHandle from './node-handle';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Trash2,
    Loader2,
    Settings2,
    Copy,
    Power,
    Lock,
    LockOpen,
    Play,
    ArrowUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { NodeExecutionGlow, NodeErrorBanner } from '@/components/canvas/node-execution-indicator';
import { themeFor } from './node-categories';
import { ModelSelector, ModelOption } from './model-selector';

export const NODE_DIMENSIONS: Record<string, { width?: number; height?: number }> = {
    documentNode: { height: 500 },
    aiChatbot: { width: 300, height: 400 },
    promptNode: { width: 280, height: 300 },
    textInput: { width: 280, height: 300 },
    generateImage: { width: 280, height: 450 },
    generateVideo: { width: 280, height: 450 },
    publishNode: { width: 450, height: 600 },
};

interface NodeShellProps {
    id: string;
    selected?: boolean;
    children: React.ReactNode;
    className?: string;
    contentClassName?: string;
    onDelete?: () => void;
    onAdvancedOpen?: () => void;
    hasAdvanced?: boolean;
    headerActions?: React.ReactNode;
    minWidth?: number;
    minHeight?: number;
    showResize?: boolean;
    title?: React.ReactNode;
    icon?: React.ReactNode;
    /** Optional explicit node type id used to look up the category accent. */
    nodeType?: string;
    /** Render disabled visual state (greyed + reduced opacity). */
    disabled?: boolean;
    /** Render locked visual state (small lock icon in header). */
    locked?: boolean;
}

/**
 * Dispatch a control-plane event up to canvas-editor.
 * canvas-editor listens for `node-action` and applies the change.
 */
const dispatchNodeAction = (nodeId: string, action: 'duplicate' | 'disable' | 'lock' | 'run') => {
    window.dispatchEvent(new CustomEvent('node-action', { detail: { nodeId, action } }));
};

const NodeShell = ({
    id,
    selected = false,
    children,
    className,
    contentClassName,
    onDelete,
    onAdvancedOpen,
    hasAdvanced = false,
    headerActions,
    minWidth = 350,
    minHeight = 220,
    showResize = true,
    title,
    icon,
    nodeType,
    disabled = false,
    locked = false,
}: NodeShellProps) => {
    const theme = themeFor(nodeType);

    // When this node's per-node error handling is set to "Route to error output"
    // (data.onError === 'errorPath'), expose an extra red source handle with id
    // 'error' so the user can drag a dedicated failure branch. The engine routes
    // failures down edges whose sourceHandle === 'error'. Read reactively from
    // the store so toggling the config in the sidebar shows/hides the handle live.
    const showErrorHandle = useStore(
        (s) => (s.nodeInternals.get(id)?.data as { onError?: unknown } | undefined)?.onError === 'errorPath',
    );

    const handleAdvancedClick = useCallback(() => {
        if (onAdvancedOpen) {
            onAdvancedOpen();
        } else {
            window.dispatchEvent(new CustomEvent('open-node-advanced', { detail: { nodeId: id } }));
        }
    }, [id, onAdvancedOpen]);

    const handleDuplicate = useCallback(() => dispatchNodeAction(id, 'duplicate'), [id]);
    const handleDisable = useCallback(() => dispatchNodeAction(id, 'disable'), [id]);
    const handleLock = useCallback(() => dispatchNodeAction(id, 'lock'), [id]);
    const handleRun = useCallback(() => dispatchNodeAction(id, 'run'), [id]);

    return (
        <div className={cn('w-full h-full relative group', disabled && 'opacity-50 grayscale')}>
            <Card
                className={cn(
                    'w-full h-full shadow-2xl dark:shadow-[0_10px_30px_-5px_rgba(255,255,255,0.3)] rounded-[28px] border-0 bg-white/90 dark:bg-black/90 group nowheel relative !overflow-visible flex flex-col',
                    selected ? 'ring-2 ring-primary' : '',
                    className,
                )}
                style={{
                    borderLeft: `3px solid ${theme.accent}`,
                    transition: 'width 90ms ease, height 90ms ease, box-shadow 150ms ease',
                }}
            >
                {/* Execution status glow effect */}
                <NodeExecutionGlow nodeId={id} />

                {/* On-node failure message (audit H13) */}
                <NodeErrorBanner nodeId={id} />

                {/* Per-node error output handle (H3) — only when onError is 'errorPath'. */}
                {showErrorHandle && (
                    <NodeHandle
                        type="source"
                        position={Position.Bottom}
                        id="error"
                        tone="danger"
                        label="ERROR"
                        labelClassName="!top-auto bottom-full mb-1 left-1/2 -translate-x-1/2"
                    />
                )}

                {showResize && (
                    <NodeResizer
                        isVisible={selected}
                        minWidth={minWidth}
                        minHeight={minHeight}
                        lineStyle={{
                            borderWidth: 6,
                            borderColor: 'transparent',
                        }}
                        handleStyle={{
                            width: 12,
                            height: 12,
                            opacity: 0,
                            pointerEvents: 'all',
                        }}
                    />
                )}

                {/* Header bar = the only drag surface. */}
                <div
                    className={cn(
                        'drag-handle nopan flex items-center gap-2 px-3 py-2 border-b border-border/40',
                        'cursor-grab active:cursor-grabbing select-none',
                        'rounded-t-[28px]',
                    )}
                >
                    {icon && (
                        <span
                            className={cn(
                                'size-6 rounded-md flex items-center justify-center shrink-0',
                                theme.iconBg,
                            )}
                        >
                            <span className="size-3.5 flex items-center justify-center">{icon}</span>
                        </span>
                    )}
                    {title && (
                        <span className="text-[12px] font-medium truncate">{title}</span>
                    )}
                    <span
                        className="text-[9px] uppercase tracking-wider font-medium shrink-0"
                        style={{ color: theme.accent }}
                    >
                        {theme.label}
                    </span>

                    {locked && (
                        <Lock className="size-3 text-muted-foreground/70 shrink-0" />
                    )}

                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {headerActions}

                        <NodeIconButton
                            label="Run from here"
                            onClick={handleRun}
                            className="hover:bg-primary/10 hover:text-primary"
                        >
                            <Play className="size-3.5" />
                        </NodeIconButton>

                        <NodeIconButton
                            label="Duplicate"
                            onClick={handleDuplicate}
                        >
                            <Copy className="size-3.5" />
                        </NodeIconButton>

                        <NodeIconButton
                            label={disabled ? 'Enable' : 'Disable'}
                            onClick={handleDisable}
                            className={disabled ? 'text-amber-600' : ''}
                        >
                            <Power className="size-3.5" />
                        </NodeIconButton>

                        <NodeIconButton
                            label={locked ? 'Unlock' : 'Lock position'}
                            onClick={handleLock}
                            className={locked ? 'text-amber-600' : ''}
                        >
                            {locked
                                ? <LockOpen className="size-3.5" />
                                : <Lock className="size-3.5" />}
                        </NodeIconButton>

                        {hasAdvanced && (
                            <NodeIconButton
                                label="Advanced settings"
                                onClick={handleAdvancedClick}
                                className="hover:bg-primary/10 hover:text-primary"
                            >
                                <Settings2 className="size-3.5" />
                            </NodeIconButton>
                        )}

                        {onDelete && (
                            <NodeIconButton
                                label="Delete node"
                                onClick={onDelete}
                                className="hover:bg-destructive/10 hover:text-destructive"
                            >
                                <Trash2 className="size-3.5" />
                            </NodeIconButton>
                        )}
                    </div>
                </div>

                <CardContent
                    className={cn('p-0 nodrag relative flex-1 flex flex-col min-h-0', contentClassName)}
                >
                    {children}
                </CardContent>
            </Card>
        </div>
    );
};

export default memo(NodeShell);

interface NodeIconButtonProps {
    children: React.ReactNode;
    label: string;
    onClick?: () => void;
    className?: string;
}

const NodeIconButton = ({ children, label, onClick, className }: NodeIconButtonProps) => (
    <TooltipProvider delayDuration={200}>
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        'size-6 rounded-full text-muted-foreground hover:bg-muted/70',
                        className,
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick?.();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                align="end"
                alignOffset={10}
                sideOffset={5}
                className="rounded-xl rounded-tr-none bg-white text-black border border-neutral-200 shadow-md text-[10px] px-2 py-1"
            >
                <p>{label}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
);

interface NodeActionInputProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onClick: () => void;
    isLoading?: boolean;
    placeholder?: string;
    buttonLabel?: string;
    disabled?: boolean;
    id?: string;
}

export const NodeActionInput = ({
    value,
    onChange,
    onKeyDown,
    onClick,
    isLoading,
    placeholder = "Enter URL",
    buttonLabel = "Add",
    disabled,
    id,
}: NodeActionInputProps) => {
    return (
        <div className="flex items-center gap-2">
            <Input
                id={id}
                placeholder={placeholder}
                className="flex-1 text-xs h-8 rounded-full"
                value={value}
                onChange={onChange}
                disabled={disabled}
                onKeyDown={onKeyDown}
            />
            <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-4"
                onClick={onClick}
                disabled={disabled || !value}
            >
                {isLoading ? <Loader2 className="size-4 animate-spin" /> : buttonLabel}
            </Button>
        </div>
    );
};

export const NodePreviewCard = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <div className="cursor-default mt-0 w-full relative">
            <Card className={cn('overflow-hidden border-0 shadow-none rounded-[24px]', className)}>
                {children}
            </Card>
        </div>
    );
};

interface NodeControlBarProps {
    modelValue?: string;
    onModelChange: (value: string, model: ModelOption) => void;
    modelType?: 'text' | 'image' | 'video' | 'all';
    onAction: () => void;
    actionIcon?: React.ReactNode;
    isLoading?: boolean;
    disabled?: boolean;
    actionDisabled?: boolean;
    children?: React.ReactNode;
}

export const NodeControlBar = ({
    modelValue,
    onModelChange,
    modelType = 'text',
    onAction,
    actionIcon,
    isLoading = false,
    disabled = false,
    actionDisabled = false,
    children,
}: NodeControlBarProps) => {
    return (
        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/10">
            {children && <div className="flex items-center gap-2">{children}</div>}
            <div className="flex items-center justify-between gap-2">
                <ModelSelector
                    value={modelValue}
                    onValueChange={onModelChange}
                    modelType={modelType}
                    triggerClassName="flex-1 min-w-0"
                    disabled={disabled || isLoading}
                />
                <Button
                    type="button"
                    onClick={onAction}
                    disabled={disabled || isLoading || actionDisabled}
                    size="icon"
                    className="size-9 rounded-full shrink-0 shadow-sm"
                >
                    {isLoading ? <Loader2 className="size-4 animate-spin" /> : (actionIcon || <ArrowUp className="size-4" />)}
                </Button>
            </div>
        </div>
    );
};
