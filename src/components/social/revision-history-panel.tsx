'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    History,
    FileText,
    Image as ImageIcon,
    Share2,
    CalendarClock,
    Sparkles,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { Chip, Skeleton, EmptyState, Timeline } from '@/components/ui-kit';
import type { ChipTone } from '@/components/ui-kit';
import type {
    RevisionChangeType,
    RevisionSubjectType,
} from '@/lib/db/models/content-revision.model';

/**
 * Revision history panel (Epic 8) — read-only audit of every content edit on a
 * draft or scheduled post. Composed from the ui-kit Timeline; renders each
 * revision with its version number, editor, relative timestamp, a changeType
 * Chip, and an expandable content preview (with a simple line-diff vs the
 * previous revision when available).
 *
 * Not wired into the composer here — a lead mounts it.
 */

interface RevisionDTO {
    _id?: string;
    version: number;
    content: string;
    mediaUrls?: string[];
    platformsSummary?: string[];
    title?: string | null;
    editedBy: string;
    editedByName?: string | null;
    changeType: RevisionChangeType;
    changeSummary?: string | null;
    createdAt: string;
}

export interface RevisionHistoryPanelProps {
    subjectType: RevisionSubjectType;
    subjectId: string;
}

const CHANGE_META: Record<
    RevisionChangeType,
    { label: string; tone: ChipTone; icon: typeof FileText }
> = {
    created: { label: 'Created', tone: 'ok', icon: Sparkles },
    content_edit: { label: 'Content', tone: 'brand', icon: FileText },
    media_edit: { label: 'Media', tone: 'purple', icon: ImageIcon },
    platform_edit: { label: 'Platforms', tone: 'info', icon: Share2 },
    schedule_edit: { label: 'Reschedule', tone: 'warn', icon: CalendarClock },
};

function relativeTime(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diffMs = Date.now() - then;
    const sec = Math.round(diffMs / 1000);
    if (sec < 45) return 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(iso).toLocaleDateString();
}

/** Build a compact added/removed line diff of `current` vs `previous`. */
function lineDiff(previous: string, current: string): { sign: '+' | '-' | ' '; text: string }[] {
    const prevLines = previous.split('\n');
    const currLines = current.split('\n');
    const prevSet = new Set(prevLines);
    const currSet = new Set(currLines);

    const rows: { sign: '+' | '-' | ' '; text: string }[] = [];
    for (const line of prevLines) {
        if (!currSet.has(line)) rows.push({ sign: '-', text: line });
    }
    for (const line of currLines) {
        rows.push({ sign: currSet.has(line) && !prevSet.has(line) ? '+' : ' ', text: line });
    }
    return rows;
}

function RevisionDetail({
    revision,
    previousContent,
}: {
    revision: RevisionDTO;
    previousContent?: string;
}) {
    const hasDiff = previousContent !== undefined && previousContent !== revision.content;

    if (hasDiff) {
        const rows = lineDiff(previousContent!, revision.content);
        return (
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed">
                {rows.map((r, i) => (
                    <div
                        key={i}
                        className={
                            r.sign === '+'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : r.sign === '-'
                                ? 'text-rose-600 line-through dark:text-rose-400'
                                : 'text-muted-foreground'
                        }
                    >
                        {`${r.sign} ${r.text}`}
                    </div>
                ))}
            </pre>
        );
    }

    return (
        <div className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-2.5 text-[12px] leading-relaxed">
            {revision.content || <span className="text-muted-foreground">(no content)</span>}
        </div>
    );
}

export function RevisionHistoryPanel({ subjectType, subjectId }: RevisionHistoryPanelProps) {
    const [revisions, setRevisions] = useState<RevisionDTO[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});

    const endpoint =
        subjectType === 'draft'
            ? `/api/social/drafts/${subjectId}/revisions`
            : `/api/social/posts/scheduled/${subjectId}/revisions`;

    const load = useCallback(async () => {
        setError(null);
        try {
            const res = await fetch(endpoint);
            if (!res.ok) {
                throw new Error(`Request failed (${res.status})`);
            }
            const data = await res.json();
            setRevisions((data.revisions ?? []) as RevisionDTO[]);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load revisions');
            setRevisions([]);
        }
    }, [endpoint]);

    useEffect(() => {
        setRevisions(null);
        void load();
    }, [load]);

    if (revisions === null) {
        return (
            <div className="flex flex-col gap-3 p-1">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-2.5">
                        <Skeleton className="h-[22px] w-[22px] rounded-[7px]" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3.5 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (error && revisions.length === 0) {
        return (
            <EmptyState
                icon={History}
                title="Couldn't load history"
                note={error}
            />
        );
    }

    if (revisions.length === 0) {
        return (
            <EmptyState
                icon={History}
                title="No revisions yet"
                note="Edits to this post will be tracked here automatically."
            />
        );
    }

    const items = revisions.map((rev, idx) => {
        // revisions are newest-first; the previous version is the next item.
        const previous = revisions[idx + 1];
        const meta = CHANGE_META[rev.changeType] ?? CHANGE_META.content_edit;
        const isOpen = !!expanded[rev.version];

        return {
            icon: meta.icon,
            tone: meta.tone,
            title: (
                <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">v{rev.version}</span>
                        <Chip tone={meta.tone}>{meta.label}</Chip>
                        <span className="text-[12px] font-normal text-muted-foreground">
                            {rev.editedByName || rev.editedBy}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            setExpanded((prev) => ({ ...prev, [rev.version]: !prev[rev.version] }))
                        }
                        className="flex w-fit items-center gap-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {isOpen ? (
                            <ChevronDown className="size-3.5" />
                        ) : (
                            <ChevronRight className="size-3.5" />
                        )}
                        {isOpen ? 'Hide content' : 'View content'}
                    </button>
                    {isOpen ? (
                        <RevisionDetail revision={rev} previousContent={previous?.content} />
                    ) : null}
                </div>
            ),
            meta: relativeTime(rev.createdAt),
        };
    });

    return <Timeline items={items} className="p-1" />;
}
