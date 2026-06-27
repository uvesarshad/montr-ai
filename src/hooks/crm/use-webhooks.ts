'use client';

import { useState, useEffect, useCallback } from 'react';
import { PaginationMeta } from '@/types/crm';
import { WebhookEvent } from '@/validations/crm/webhook.schema';

export interface Webhook {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  secret?: string;
  events: WebhookEvent[];
  filters: Array<{
    field: string;
    operator: string;
    value: unknown;
  }>;
  maxRetries: number;
  retryDelaySeconds: number;
  deliveryCount: number;
  failureCount: number;
  lastDeliveredAt?: Date;
  lastFailedAt?: Date;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookFilters {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  isActive?: boolean;
  event?: string;
  createdById?: string;
}

export interface UseWebhooksResult {
  webhooks: Webhook[];
  loading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  refresh: () => Promise<void>;
  deleteWebhook: (id: string) => Promise<void>;
  test: (id: string, event: string, payload?: Record<string, unknown>) => Promise<void>;
}

export function useWebhooks(filters?: WebhookFilters): UseWebhooksResult {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();

      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.search) params.append('search', filters.search);
      if (filters?.sort) params.append('sort', filters.sort);
      if (filters?.isActive !== undefined) params.append('isActive', filters.isActive.toString());
      if (filters?.event) params.append('event', filters.event);
      if (filters?.createdById) params.append('createdById', filters.createdById);

      const queryString = params.toString();
      const url = `/api/v2/crm/webhooks${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 403) {
          throw new Error('No organization found');
        }
        throw new Error('Failed to fetch webhooks');
      }

      const data = await response.json();
      setWebhooks(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching webhooks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load webhooks');
      setWebhooks([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const deleteWebhook = async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/webhooks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete webhook');
      }

      await fetchWebhooks();
    } catch (err) {
      throw err;
    }
  };

  const test = async (id: string, event: string, payload?: Record<string, unknown>) => {
    try {
      const response = await fetch(`/api/v2/crm/webhooks/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ event, payload }),
      });

      if (!response.ok) {
        throw new Error('Failed to test webhook');
      }
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  return {
    webhooks,
    loading,
    error,
    pagination,
    refetch: fetchWebhooks,
    refresh: fetchWebhooks,
    deleteWebhook,
    test,
  };
}
