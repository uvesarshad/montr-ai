'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { SettingRow } from '@/components/ui-kit';
import { useEmailAccounts } from '@/hooks/crm/use-email-accounts';
import { BlocklistManager } from './blocklist-manager';
import { toast } from 'sonner';

interface EmailSyncSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Email-sync settings: per-account auto-link / auto-create toggles plus the
 * org-wide sender blocklist.
 */
export function EmailSyncSettingsDialog({ open, onOpenChange }: EmailSyncSettingsDialogProps) {
  const { accounts, updateAccount } = useEmailAccounts();

  const toggle = async (
    id: string,
    field: 'autoLinkContacts' | 'autoCreateContacts' | 'autoCreateCompanies',
    value: boolean,
  ) => {
    try {
      await updateAccount(id, { [field]: value });
    } catch {
      toast.error('Failed to update setting');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Email sync settings</DialogTitle>
          <DialogDescription>
            Control how synced emails create and link CRM records.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-lg border border-border p-4">
              <div className="mb-1 text-[13.5px] font-semibold">{account.email}</div>
              <div className="divide-y divide-border">
                <SettingRow
                  label="Auto-link contacts"
                  description="Link synced emails to existing contacts that match the sender."
                >
                  <Switch
                    checked={account.autoLinkContacts}
                    onCheckedChange={(v) => toggle(account.id, 'autoLinkContacts', v)}
                  />
                </SettingRow>
                <SettingRow
                  label="Auto-create contacts"
                  description="Create a new contact when an inbound email's sender is unknown."
                >
                  <Switch
                    checked={account.autoCreateContacts}
                    onCheckedChange={(v) => toggle(account.id, 'autoCreateContacts', v)}
                  />
                </SettingRow>
                <SettingRow
                  label="Auto-create companies"
                  description="Create a company from the sender's domain (non-free providers only)."
                >
                  <Switch
                    checked={account.autoCreateCompanies}
                    onCheckedChange={(v) => toggle(account.id, 'autoCreateCompanies', v)}
                  />
                </SettingRow>
              </div>
            </div>
          ))}

          <BlocklistManager />
        </div>
      </DialogContent>
    </Dialog>
  );
}
