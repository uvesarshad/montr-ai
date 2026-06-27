'use client';

import { useState, useEffect, useCallback } from 'react';
import { Webhook } from './use-webhooks';
import { PaginationMeta } from '@/types/crm';

export interface WebhookLog {
  _id: string;
  webhookId: string;
  event: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  responseStatus?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  success: boolean;
  error?: string;
  retryCount: number;
  nextRetryAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
}

export interface WebhookLogFilters {
  page?: number;
  limit?: number;
  event?: string;
  success?: boolean;
  statusCode?: number;
}

export interface UseWebhookResult {
  webhook: Webhook | null;
  logs: WebhookLog[];
  loading: boolean;
  logsLoading: boolean;
  error: string | null;
  pagination: PaginationMeta | null;
  refetch: () => Promise<void>;
  retryLog: (logId: string) => Promise<void>;
}

export function useWebhook(id: string | null, logFilters?: WebhookLogFilters): UseWebhookResult {
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);

  const fetchWebhook = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/webhooks/${id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        if (response.status === 404) {
          throw new Error('Webhook not found');
        }
        throw new Error('Failed to fetch webhook');
      }

      const data = await response.json();
      setWebhook(data.data);
    } catch (err) {
      console.error('Error fetching webhook:', err);
      setError(err instanceof Error ? err.message : 'Failed to load webhook');
      setWebhook(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchLogs = useCallback(async () => {
    if (!id) return;

    try {
      setLogsLoading(true);

      const params = new URLSearchParams();
      params.append('webhookId', id);
      if (logFilters?.page) params.append('page', logFilters.page.toString());
      if (logFilters?.limit) params.append('limit', logFilters.limit.toString());
      if (logFilters?.event) params.append('event', logFilters.event);
      if (logFilters?.success !== undefined) params.append('success', logFilters.success.toString());
      if (logFilters?.statusCode) params.append('statusCode', logFilters.statusCode.toString());

      const queryString = params.toString();
      const url = `/api/v2/crm/webhooks/${id}/logs${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }

      const data = await response.json();
      setLogs(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error('Error fetching webhook logs:', err);
      setLogs([]);
      setPagination(null);
    } finally {
      setLogsLoading(false);
    }
  }, [id, logFilters]);

  const retryLog = async (logId: string) => {
    try {
      const response = await fetch(`/api/v2/crm/webhooks/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ logId }),
      });

      if (!response.ok) {
        throw new Error('Failed to retry webhook delivery');
      }

      await fetchLogs();
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    fetchWebhook();
    fetchLogs();
  }, [fetchWebhook, fetchLogs]);

  return {
    webhook,
    logs,
    loading,
    logsLoading,
    error,
    pagination,
    refetch: fetchWebhook,
    retryLog,
  };
}
