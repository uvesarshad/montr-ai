import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

export interface CanvasScheduleInfo {
    canvasId: string;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    nextRunAt: string | null;
    intervalMs: number | null;
    stalled: boolean;
}

const EMPTY: Record<string, CanvasScheduleInfo> = {};

/**
 * Schedule visibility (TODO 2.17). Fetches per-canvas last-run / next-run /
 * stalled metadata from the light org-scoped endpoint and returns it keyed by
 * canvasId so list rows/cards can look up their own row in O(1).
 */
export function useCanvasScheduleInfo() {
    const { status } = useSession();

    const { data } = useQuery<Record<string, CanvasScheduleInfo>>({
        queryKey: ['canvas-schedule-info'],
        queryFn: async () => {
            const res = await fetch('/api/v2/canvases/schedule-info', { credentials: 'include' });
            if (!res.ok) return EMPTY;
            const body = await res.json();
            const map: Record<string, CanvasScheduleInfo> = {};
            for (const row of (body.schedules || []) as CanvasScheduleInfo[]) {
                map[row.canvasId] = row;
            }
            return map;
        },
        enabled: status === 'authenticated',
    });

    return data ?? EMPTY;
}
