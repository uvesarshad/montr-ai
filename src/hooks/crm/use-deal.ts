'use client';

import { useState, useEffect, useCallback } from 'react';
import { Deal } from '@/types/crm';
import { CreateDealInput, UpdateDealInput } from '@/validations/crm/deal.schema';

export interface UseDealResult {
  deal: Deal | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateDeal: (data: UpdateDealInput) => Promise<Deal>;
  deleteDeal: () => Promise<void>;
  createDeal: (data: CreateDealInput) => Promise<Deal>;
  moveDealToStage: (stageId: string) => Promise<Deal>;
  markDealAsWon: (wonReason?: string) => Promise<Deal>;
  markDealAsLost: (lostReason: string) => Promise<Deal>;
}

export function useDeal(id?: string): UseDealResult {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);

  const fetchDeal = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/deals/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 404) {
          throw new Error('Deal not found');
        }
        throw new Error('Failed to fetch deal');
      }

      const data = await response.json();
      setDeal(data);
    } catch (err) {
      console.error('Error fetching deal:', err);
      setError(err instanceof Error ? err.message : 'Failed to load deal');
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  const createDeal = useCallback(async (data: CreateDealInput): Promise<Deal> => {
    try {
      const response = await fetch('/api/v2/crm/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deal');
      }

      const newDeal = await response.json();
      setDeal(newDeal);
      return newDeal;
    } catch (err) {
      console.error('Error creating deal:', err);
      throw err instanceof Error ? err : new Error('Failed to create deal');
    }
  }, []);

  const updateDeal = useCallback(
    async (data: UpdateDealInput): Promise<Deal> => {
      if (!id) {
        throw new Error('No deal ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/deals/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update deal');
        }

        const updatedDeal = await response.json();
        setDeal(updatedDeal);
        return updatedDeal;
      } catch (err) {
        console.error('Error updating deal:', err);
        throw err instanceof Error ? err : new Error('Failed to update deal');
      }
    },
    [id]
  );

  const deleteDeal = useCallback(async (): Promise<void> => {
    if (!id) {
      throw new Error('No deal ID provided');
    }

    try {
      const response = await fetch(`/api/v2/crm/deals/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete deal');
      }

      setDeal(null);
    } catch (err) {
      console.error('Error deleting deal:', err);
      throw err instanceof Error ? err : new Error('Failed to delete deal');
    }
  }, [id]);

  const moveDealToStage = useCallback(
    async (stageId: string): Promise<Deal> => {
      if (!id) {
        throw new Error('No deal ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/deals/${id}/stage`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ stageId }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to move deal');
        }

        const updatedDeal = await response.json();
        setDeal(updatedDeal);
        return updatedDeal;
      } catch (err) {
        console.error('Error moving deal:', err);
        throw err instanceof Error ? err : new Error('Failed to move deal');
      }
    },
    [id]
  );

  const markDealAsWon = useCallback(
    async (wonReason?: string): Promise<Deal> => {
      if (!id) {
        throw new Error('No deal ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/deals/${id}/won`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ wonReason }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to mark deal as won');
        }

        const updatedDeal = await response.json();
        setDeal(updatedDeal);
        return updatedDeal;
      } catch (err) {
        console.error('Error marking deal as won:', err);
        throw err instanceof Error ? err : new Error('Failed to mark deal as won');
      }
    },
    [id]
  );

  const markDealAsLost = useCallback(
    async (lostReason: string): Promise<Deal> => {
      if (!id) {
        throw new Error('No deal ID provided');
      }

      try {
        const response = await fetch(`/api/v2/crm/deals/${id}/lost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ lostReason }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to mark deal as lost');
        }

        const updatedDeal = await response.json();
        setDeal(updatedDeal);
        return updatedDeal;
      } catch (err) {
        console.error('Error marking deal as lost:', err);
        throw err instanceof Error ? err : new Error('Failed to mark deal as lost');
      }
    },
    [id]
  );

  return {
    deal,
    loading,
    error,
    refetch: fetchDeal,
    updateDeal,
    deleteDeal,
    createDeal,
    moveDealToStage,
    markDealAsWon,
    markDealAsLost,
  };
}
