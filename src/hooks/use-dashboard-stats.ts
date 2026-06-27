import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/auth-client';

interface DashboardStats {
    collaborators: number;
    activeNow: number;
    aiGenerations: number;
}

const EMPTY_STATS: DashboardStats = {
    collaborators: 0,
    activeNow: 0,
    aiGenerations: 0,
};

export function useDashboardStats() {
    const { data: session } = useSession();
    const enabled = !!session?.user;

    const { data, isLoading, error } = useQuery<DashboardStats>({
        queryKey: ['dashboard-stats'],
        queryFn: async () => {
            const response = await fetch('/api/dashboard/stats');

            if (!response.ok) {
                throw new Error('Failed to fetch dashboard stats');
            }

            return response.json();
        },
        enabled,
    });

    return {
        stats: data ?? EMPTY_STATS,
        loading: enabled ? isLoading : true,
        error: error ? (error instanceof Error ? error.message : 'Failed to load stats') : null,
    };
}
