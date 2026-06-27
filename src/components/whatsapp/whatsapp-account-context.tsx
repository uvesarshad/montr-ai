'use client';

/**
 * Shared WhatsApp account state for the /whatsapp module.
 *
 * Most WhatsApp components take an optional `accountId` and self-fetch their
 * data, so the module-level concern is: which connected account is selected.
 * The layout wraps the module in this provider; pages read the selected
 * accountId and render `<WhatsAppAccountSelect />` in their title strip.
 */

import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface WhatsAppAccount {
  _id: string;
  name: string;
  phoneNumber?: string;
  displayPhoneNumber?: string;
  wabaId?: string;
}

interface WhatsAppAccountContextValue {
  accounts: WhatsAppAccount[];
  loading: boolean;
  selectedAccountId: string | null;
  selectedAccount: WhatsAppAccount | null;
  setSelectedAccountId: (id: string) => void;
  refetch: () => void;
}

const WhatsAppAccountContext = React.createContext<WhatsAppAccountContextValue | null>(null);

export function WhatsAppAccountProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = React.useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);

  const fetchAccounts = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/accounts', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load accounts');
      const data = await res.json();
      const list: WhatsAppAccount[] = data.accounts ?? [];
      setAccounts(list);
      setSelectedAccountId((current) => current ?? list[0]?._id ?? null);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const selectedAccount = React.useMemo(
    () => accounts.find((account) => account._id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );

  const value = React.useMemo<WhatsAppAccountContextValue>(
    () => ({
      accounts,
      loading,
      selectedAccountId,
      selectedAccount,
      setSelectedAccountId,
      refetch: fetchAccounts,
    }),
    [accounts, loading, selectedAccountId, selectedAccount, fetchAccounts],
  );

  return (
    <WhatsAppAccountContext.Provider value={value}>
      {children}
    </WhatsAppAccountContext.Provider>
  );
}

export function useWhatsAppAccount() {
  const ctx = React.useContext(WhatsAppAccountContext);
  if (!ctx) {
    throw new Error('useWhatsAppAccount must be used within a WhatsAppAccountProvider');
  }
  return ctx;
}

/** Account picker for a page's title strip. Renders nothing when there are no accounts. */
export function WhatsAppAccountSelect() {
  const { accounts, selectedAccountId, setSelectedAccountId } = useWhatsAppAccount();

  if (accounts.length === 0) return null;

  return (
    <Select value={selectedAccountId ?? undefined} onValueChange={setSelectedAccountId}>
      <SelectTrigger className="h-8 w-[200px] text-[13px]">
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account._id} value={account._id}>
            {account.name}
            {account.displayPhoneNumber ? ` · ${account.displayPhoneNumber}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
