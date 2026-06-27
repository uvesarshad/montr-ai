'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from '@/lib/auth-client';

interface CreditUsage {
    totalAllocated: number;
    totalUsed: number;
    remaining: number;
    usageByType: {
        text: number;
        image: number;
        video: number;
        scraping: number;
    };
    periodEnd: string | null;
    hasActiveSubscription: boolean;
}

interface UseCreditsResult {
    credits: CreditUsage | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

export function useCredits(): UseCreditsResult {
    const { status } = useSession();
    const [credits, setCredits] = useState<CreditUsage | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchCredits = useCallback(async () => {
        if (status !== 'authenticated') {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch('/api/credits', {
                credentials: 'include',
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized');
                }
                throw new Error('Failed to fetch credits');
            }

            const data = await response.json();
            setCredits(data);
        } catch (err) {
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [status]);

    useEffect(() => {
        fetchCredits();
    }, [fetchCredits]);

    // Auto-refetch credits when window gains focus or becomes visible
    // This ensures credits update automatically after admin changes
    useEffect(() => {
        if (status !== 'authenticated') return;

        let debounceTimer: NodeJS.Timeout;

        const handleRefetch = () => {
            // Debounce to prevent excessive API calls
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchCredits();
            }, 500);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                handleRefetch();
            }
        };

        // Listen for window focus
        window.addEventListener('focus', handleRefetch);
        // Listen for page visibility changes
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearTimeout(debounceTimer);
            window.removeEventListener('focus', handleRefetch);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [status, fetchCredits]);

    return {
        credits,
        isLoading,
        error,
        refetch: fetchCredits,
    };
}
