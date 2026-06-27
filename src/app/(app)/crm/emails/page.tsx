'use client';

import { useState, useCallback } from 'react';
import { useEmails } from '@/hooks/crm/use-emails';
import { useEmailAccounts } from '@/hooks/crm/use-email-accounts';
import { EmailList } from '@/components/crm/emails/email-list';
import { EmailFilters } from '@/components/crm/emails/email-filters';
import { EmailComposer } from '@/components/crm/emails/email-composer';
import { EmailSyncSettingsDialog } from '@/components/crm/emails/email-sync-settings-dialog';
import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Inbox, Send, Star, Archive, Trash2, RefreshCw, Pencil, Mail, Settings } from 'lucide-react';

export default function EmailsPage() {
  const [selectedFolder, setSelectedFolder] = useState<string>('inbox');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [composeOpen, setComposeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { accounts, loading: accountsLoading, syncAccount } = useEmailAccounts();

  const {
    emails,
    loading,
    error,
    pagination,
    refetch,
    markAsRead,
    markAsUnread,
    toggleStar,
    deleteEmail,
  } = useEmails(
    {
      accountId: selectedAccountId,
      folder: selectedFolder,
      isRead: showUnreadOnly ? false : undefined,
      search: searchQuery || undefined,
    },
    { page, limit: 25, sort: 'date', sortDirection: 'desc' }
  );

  const handleSync = useCallback(async () => {
    if (!selectedAccountId) {
      // Sync all accounts
      for (const account of accounts) {
        try {
          await syncAccount(account.id);
        } catch (error) {
          console.error('Error syncing account:', error);
        }
      }
    } else {
      await syncAccount(selectedAccountId);
    }
    refetch();
  }, [selectedAccountId, accounts, syncAccount, refetch]);

  const folders = [
    { value: 'inbox', label: 'Inbox', icon: Inbox },
    { value: 'sent', label: 'Sent', icon: Send },
    { value: 'starred', label: 'Starred', icon: Star },
    { value: 'archive', label: 'Archive', icon: Archive },
    { value: 'trash', label: 'Trash', icon: Trash2 },
  ];

  const filterBar = (
    <div className="flex flex-wrap items-center gap-4">
      {/* Account selector */}
      <Select value={selectedAccountId || 'all'} onValueChange={(value) => {
        setSelectedAccountId(value === 'all' ? undefined : value);
        setPage(1);
      }}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All accounts" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All accounts</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Folder selector */}
      <div className="flex gap-1">
        {folders.map((folder) => {
          const Icon = folder.icon;
          return (
            <Button
              key={folder.value}
              variant={selectedFolder === folder.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setSelectedFolder(folder.value);
                setPage(1);
              }}
            >
              <Icon className="mr-2 size-4" />
              {folder.label}
            </Button>
          );
        })}
      </div>

      {/* Filters */}
      <EmailFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showUnreadOnly={showUnreadOnly}
        onUnreadOnlyChange={setShowUnreadOnly}
      />
    </div>
  );

  const emailsPrimaryAction = (
    <Button
      variant="default"
      size="sm"
      onClick={() => setComposeOpen(true)}
      disabled={accounts.length === 0}
    >
      <Pencil className="mr-2 size-4" />
      Compose
    </Button>
  );

  const emailsSecondaryActions = (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={accountsLoading}
      >
        <RefreshCw className="mr-2 size-4" />
        Sync
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings className="mr-2 size-4" />
        Sync settings
      </Button>
    </>
  );

  return (
    <ModuleShell
      title="Emails"
      icon={Mail}
      meta={pagination.total ? `${pagination.total} total` : 'Manage your connected email accounts'}
      primaryAction={emailsPrimaryAction}
      secondaryActions={emailsSecondaryActions}
      filterBar={filterBar}
      error={error ? { title: 'Error loading emails', message: error, onRetry: refetch } : null}
      isLoading={loading}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <div className="rounded-xl border border-border bg-card">
        {emails.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center text-muted-foreground">
            No emails found
          </div>
        ) : (
          <EmailList
            emails={emails}
            onMarkRead={markAsRead}
            onMarkUnread={markAsUnread}
            onToggleStar={toggleStar}
            onDelete={deleteEmail}
          />
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!pagination.hasMore}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Email Composer */}
      <EmailComposer
        open={composeOpen}
        onOpenChange={setComposeOpen}
      />

      {/* Email sync settings (auto-create toggles + blocklist) */}
      <EmailSyncSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </ModuleShell>
  );
}
