'use client';

import { useState, useEffect, useCallback } from 'react';
import { CrmStats, DealFunnelStats, LeaderboardEntry } from '@/types/crm';

export interface UseCrmStatsResult {
  stats: CrmStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCrmStats(): UseCrmStatsResult {
  const [stats, setStats] = useState<CrmStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v2/crm/stats/overview', {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch stats');
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching CRM stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}

export interface UseDealFunnelResult {
  funnelStats: DealFunnelStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDealFunnel(pipelineId?: string): UseDealFunnelResult {
  const [funnelStats, setFunnelStats] = useState<DealFunnelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFunnelStats = useCallback(async () => {
    if (!pipelineId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/stats/pipeline/${pipelineId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch funnel stats');
      }

      const data = await response.json();
      setFunnelStats(data);
    } catch (err) {
      console.error('Error fetching funnel stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load funnel stats');
      setFunnelStats(null);
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    fetchFunnelStats();
  }, [fetchFunnelStats]);

  return {
    funnelStats,
    loading,
    error,
    refetch: fetchFunnelStats,
  };
}

export interface UseLeaderboardResult {
  leaderboard: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLeaderboard(period?: 'week' | 'month' | 'quarter' | 'year'): UseLeaderboardResult {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (period) {
        params.append('period', period);
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/stats/leaderboard${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch leaderboard');
      }

      const data = await response.json();
      setLeaderboard(data.leaderboard || data || []);
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    leaderboard,
    loading,
    error,
    refetch: fetchLeaderboard,
  };
}
