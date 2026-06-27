'use client';

import { Users, Plus } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Card, Button } from '@/components/ui-kit';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import { ContactGroupManager } from '@/components/whatsapp/groups/contact-group-manager';
import { ContactImportExport } from '@/components/whatsapp/contacts/contact-import-export';
import { CustomFieldManager } from '@/components/whatsapp/custom-fields/custom-field-manager';
import {
  useWhatsAppAccount,
  WhatsAppAccountSelect,
} from '@/components/whatsapp/whatsapp-account-context';

export default function WhatsAppContactsPage() {
  const { accounts, loading, selectedAccountId, refetch } = useWhatsAppAccount();

  const connectAction = (
    <ConnectAccountDialog
      onSuccess={refetch}
      trigger={
        <Button size="sm" icon={Plus}>
          Connect account
        </Button>
      }
    />
  );

  return (
    <ModuleShell
      title="Contacts"
      icon={Users}
      secondaryActions={accounts.length > 0 ? <WhatsAppAccountSelect /> : undefined}
      isLoading={loading}
      isEmpty={!loading && accounts.length === 0}
      emptyState={{
        icon: Users,
        title: 'Connect a WhatsApp account',
        description:
          'Link your WhatsApp Business account to manage contacts, groups, and custom fields.',
        action: connectAction,
      }}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {selectedAccountId ? (
        <>
          {/* Contact Groups */}
          <Card bodyClassName="p-4">
            <ContactGroupManager accountId={selectedAccountId} />
          </Card>

          {/* Import / Export */}
          <Card icon={Users} title="Import & Export" bodyClassName="px-4 pb-4">
            <ContactImportExport accountId={selectedAccountId} />
          </Card>

          {/* Custom Fields */}
          <Card bodyClassName="p-4">
            <CustomFieldManager />
          </Card>
        </>
      ) : null}
    </ModuleShell>
  );
}
