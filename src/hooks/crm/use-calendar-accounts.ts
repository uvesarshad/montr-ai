import { useState, useEffect, useCallback } from 'react';

export interface CalendarInfo {
  calendarId: string;
  name: string;
  color?: string;
  isPrimary: boolean;
  syncEnabled: boolean;
  accessRole: 'owner' | 'writer' | 'reader';
}

export interface CalendarAccount {
  id: string;
  email: string;
  displayName?: string;
  provider: 'google' | 'outlook';
  isActive: boolean;
  calendars: CalendarInfo[];
  syncEnabled: boolean;
  syncDirection: 'one_way' | 'two_way';
  autoLinkContacts: boolean;
  lastSyncAt?: Date;
  lastSyncError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function useCalendarAccounts() {
  const [accounts, setAccounts] = useState<CalendarAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v2/crm/calendar-accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch calendar accounts');
      }

      const result = await response.json();
      setAccounts(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/calendar-accounts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete calendar account');
      }

      await fetchAccounts();
    } catch (err) {
      throw err;
    }
  }, [fetchAccounts]);

  const syncAccount = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/calendar-accounts/${id}/sync`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync calendar account');
      }

      await fetchAccounts();
    } catch (err) {
      throw err;
    }
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: string, data: Partial<CalendarAccount>) => {
    try {
      const response = await fetch(`/api/v2/crm/calendar-accounts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update calendar account');
      }

      await fetchAccounts();
    } catch (err) {
      throw err;
    }
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    refetch: fetchAccounts,
    deleteAccount,
    syncAccount,
    updateAccount,
  };
}
