import { useState, useEffect, useCallback } from 'react';

export interface EmailAccount {
  id: string;
  email: string;
  displayName?: string;
  provider: 'gmail' | 'outlook' | 'imap';
  isActive: boolean;
  syncEnabled: boolean;
  syncFolders: string[];
  autoLinkContacts: boolean;
  autoCreateContacts: boolean;
  autoCreateCompanies: boolean;
  lastSyncAt?: Date;
  lastSyncError?: string;
  totalEmailsSynced: number;
  createdAt: Date;
  updatedAt: Date;
}

export function useEmailAccounts() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/v2/crm/email-accounts');
      if (!response.ok) {
        throw new Error('Failed to fetch email accounts');
      }

      const result = await response.json();
      setAccounts(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const deleteAccount = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/email-accounts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete email account');
      }

      await fetchAccounts();
    } catch (err) {
      throw err;
    }
  }, [fetchAccounts]);

  const syncAccount = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/email-accounts/${id}/sync`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to sync email account');
      }

      await fetchAccounts();
    } catch (err) {
      throw err;
    }
  }, [fetchAccounts]);

  const updateAccount = useCallback(async (id: string, data: Partial<EmailAccount>) => {
    try {
      const response = await fetch(`/api/v2/crm/email-accounts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to update email account');
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
