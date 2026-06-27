'use client';

import React, { memo, useState, useCallback } from 'react';
import { NodeProps, useReactFlow } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Pencil, Check, Trash2 } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface StickyNoteData {
    content?: string;
    color?: string;
    userName?: string;
    userAvatar?: string | null;
    timestamp?: string;
    isExpanded?: boolean;
}

const COLORS = [
    { name: 'Cream', value: '#FFF9E6', border: '#E5D5B7' },
    { name: 'Mint', value: '#E8F5E9', border: '#A5D6A7' },
    { name: 'Sky', value: '#E3F2FD', border: '#90CAF9' },
    { name: 'Lavender', value: '#F3E5F5', border: '#CE93D8' },
    { name: 'Peach', value: '#FFF3E0', border: '#FFCC80' },
];

// Sticky-note content can come from the canvas JSON, the AI workflow generator,
// or pasted HTML — coerce it to a plain string and cap the length so a
// malicious / malformed payload can't smuggle markup through any future HTML
// renderer or blow up the React tree with a giant blob.
const MAX_NOTE_LEN = 10_000;
function sanitizeNoteContent(raw: unknown): string {
    if (raw == null) return '';
    const str = typeof raw === 'string' ? raw : String(raw);
    // Strip raw HTML tags — we render through <Textarea value={...}> today, but
    // any export/preview path that later uses dangerouslySetInnerHTML would
    // otherwise be vulnerable. Cheap defense in depth.
    const stripped = str.replace(/<[^>]*>/g, '');
    return stripped.length > MAX_NOTE_LEN ? stripped.slice(0, MAX_NOTE_LEN) : stripped;
}

function StickyNoteNode({ data, selected, id }: NodeProps<StickyNoteData>) {
    const { deleteElements } = useReactFlow();
    const [content, setContent] = useState(() => sanitizeNoteContent(data.content));
    const [colorIndex, setColorIndex] = useState(0);
    const [isExpanded, setIsExpanded] = useState(data.isExpanded ?? false);
    const [isHovered, setIsHovered] = useState(false);

    const currentColor = COLORS[colorIndex];
    const userName = data.userName || 'Anonymous';
    const userAvatar = data.userAvatar || null;
    const timestamp = data.timestamp ? new Date(data.timestamp) : new Date();

    // Format timestamp as "X time ago"
    const getTimeAgo = (date: Date) => {
        const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
        const years = Math.floor(months / 12);
        return `${years} year${years > 1 ? 's' : ''} ago`;
    };

    const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(sanitizeNoteContent(e.target.value));
    }, []);

    const cycleColor = useCallback(() => {
        setColorIndex((prev) => (prev + 1) % COLORS.length);
    }, []);

    const handleDelete = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        deleteElements({ nodes: [{ id }] });
    }, [deleteElements, id]);

    const getInitials = (name: string) => {
        const names = name.split(' ');
        if (names.length > 1 && names[0] && names[1]) {
            return names[0][0] + names[1][0];
        }
        return name.substring(0, 2);
    };

    const shouldExpand = isExpanded || isHovered || selected;

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setIsExpanded(!isExpanded)}
            className="relative transition-all duration-300 ease-in-out cursor-pointer"
            style={{
                width: shouldExpand ? '250px' : '40px',
                height: shouldExpand ? 'auto' : '40px',
                minHeight: shouldExpand ? '120px' : '40px',
            }}
        >
            {/* Collapsed state - just avatar */}
            {!shouldExpand && (
                <div className="size-10 rounded-full overflow-hidden border-2 border-border shadow-lg">
                    <Avatar className="w-full h-full">
                        <AvatarImage src={userAvatar || undefined} alt={userName} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                            {getInitials(userName)}
                        </AvatarFallback>
                    </Avatar>
                </div>
            )}

            {/* Expanded state - full comment */}
            {shouldExpand && (
                <div
                    className="rounded-xl shadow-lg border border-border/40 bg-background/95 backdrop-blur-sm overflow-hidden"
                    style={{
                        borderColor: selected ? currentColor.border : undefined,
                    }}
                >
                    {/* Header with avatar, name, timestamp, and actions */}
                    <div className="flex items-center gap-2 p-3 pb-2 border-b border-border/40">
                        <Avatar className="size-8">
                            <AvatarImage src={userAvatar || undefined} alt={userName} />
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                {getInitials(userName)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{userName}</div>
                            <div className="text-xs text-muted-foreground">{getTimeAgo(timestamp)}</div>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Color picker button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    cycleColor();
                                }}
                                className="size-5 rounded-full border-2 border-border transition-transform hover:scale-110"
                                style={{ backgroundColor: currentColor.border }}
                                title="Change color"
                            />
                            {/* Delete button */}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            className="size-6 rounded-md flex items-center justify-center hover:bg-destructive/10 transition-colors"
                                        >
                                            <Trash2 className="size-3.5 text-destructive" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="end" alignOffset={10} className="rounded-xl rounded-tr-none bg-white text-black border border-neutral-200 shadow-md text-[10px] px-2 py-1" sideOffset={5}>
                                        <p>Delete Comment</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            {/* Edit/Done icon */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsExpanded(!isExpanded);
                                }}
                                className="size-6 rounded-md flex items-center justify-center hover:bg-muted/50 transition-colors"
                                title={isExpanded ? "Collapse" : "Expand"}
                            >
                                {isExpanded ? (
                                    <Check className="size-3.5 text-muted-foreground" />
                                ) : (
                                    <Pencil className="size-3.5 text-muted-foreground" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 pt-2">
                        <Textarea
                            value={content}
                            onChange={handleContentChange}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Add a comment..."
                            className="w-full min-h-[60px] bg-transparent border-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm text-foreground placeholder:text-muted-foreground p-0"
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default memo(StickyNoteNode);
