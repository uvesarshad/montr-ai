import { useState, useEffect, useCallback } from 'react';

export interface Email {
  id: string;
  accountId: string;
  messageId: string;
  threadId?: string;
  from: {
    email: string;
    name?: string;
  };
  to: Array<{
    email: string;
    name?: string;
  }>;
  cc: Array<{
    email: string;
    name?: string;
  }>;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  date: Date;
  folder: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isDraft: boolean;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  isLinked: boolean;
  direction: 'inbound' | 'outbound';
  hasAttachments: boolean;
  attachments: Array<{
    fileName: string;
    mimeType: string;
    size: number;
  }>;
}

export interface EmailFilters {
  accountId?: string;
  folder?: string;
  threadId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  direction?: 'inbound' | 'outbound';
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  dateAfter?: Date;
  dateBefore?: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

export function useEmails(
  filters: EmailFilters = {},
  options: PaginationOptions = {}
) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  const filtersKey = JSON.stringify(filters);
  const optionsKey = JSON.stringify(options);

  const fetchEmails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', (options.page || 1).toString());
      params.set('limit', (options.limit || 25).toString());
      params.set('sort', options.sort || 'date');
      params.set('sortDirection', options.sortDirection || 'desc');

      if (filters.accountId) params.set('accountId', filters.accountId);
      if (filters.folder) params.set('folder', filters.folder);
      if (filters.threadId) params.set('threadId', filters.threadId);
      if (filters.contactId) params.set('contactId', filters.contactId);
      if (filters.companyId) params.set('companyId', filters.companyId);
      if (filters.dealId) params.set('dealId', filters.dealId);
      if (filters.direction) params.set('direction', filters.direction);
      if (filters.isRead !== undefined) params.set('isRead', filters.isRead.toString());
      if (filters.isStarred !== undefined) params.set('isStarred', filters.isStarred.toString());
      if (filters.search) params.set('search', filters.search);
      if (filters.dateAfter) params.set('dateAfter', filters.dateAfter.toISOString());
      if (filters.dateBefore) params.set('dateBefore', filters.dateBefore.toISOString());

      const response = await fetch(`/api/v2/crm/emails?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch emails');
      }

      const result = await response.json();
      setEmails(result.data || []);
      setPagination(result.pagination || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch emails');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, optionsKey]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/emails/${id}/mark-read`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to mark email as read');
      }

      await fetchEmails();
    } catch (err) {
      throw err;
    }
  }, [fetchEmails]);

  const markAsUnread = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/emails/${id}/mark-unread`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to mark email as unread');
      }

      await fetchEmails();
    } catch (err) {
      throw err;
    }
  }, [fetchEmails]);

  const toggleStar = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/emails/${id}/toggle-star`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to toggle email star');
      }

      await fetchEmails();
    } catch (err) {
      throw err;
    }
  }, [fetchEmails]);

  const linkToEntity = useCallback(async (
    id: string,
    links: { contactId?: string; companyId?: string; dealId?: string }
  ) => {
    try {
      const response = await fetch(`/api/v2/crm/emails/${id}/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(links),
      });

      if (!response.ok) {
        throw new Error('Failed to link email');
      }

      await fetchEmails();
    } catch (err) {
      throw err;
    }
  }, [fetchEmails]);

  const deleteEmail = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/emails/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete email');
      }

      await fetchEmails();
    } catch (err) {
      throw err;
    }
  }, [fetchEmails]);

  return {
    emails,
    loading,
    error,
    pagination,
    refetch: fetchEmails,
    markAsRead,
    markAsUnread,
    toggleStar,
    linkToEntity,
    deleteEmail,
  };
}

export function useEmail(id: string) {
  const [email, setEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmail = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/emails/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch email');
      }

      const result = await response.json();
      setEmail(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEmail();
  }, [fetchEmail]);

  return {
    email,
    loading,
    error,
    refetch: fetchEmail,
  };
}

export function useEmailThread(threadId: string) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThread = useCallback(async () => {
    if (!threadId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/emails/threads/${threadId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch email thread');
      }

      const result = await response.json();
      setEmails(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email thread');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  return {
    emails,
    loading,
    error,
    refetch: fetchThread,
  };
}
