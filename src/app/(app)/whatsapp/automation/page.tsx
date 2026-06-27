'use client';

import { Workflow, Plus } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui-kit';
import { AutoReplyManager } from '@/components/whatsapp/automation/auto-reply-manager';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import {
  useWhatsAppAccount,
  WhatsAppAccountSelect,
} from '@/components/whatsapp/whatsapp-account-context';

export default function WhatsAppAutomationPage() {
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
      title="Automation"
      icon={Workflow}
      secondaryActions={accounts.length > 0 ? <WhatsAppAccountSelect /> : undefined}
      isLoading={loading}
      isEmpty={!loading && accounts.length === 0}
      emptyState={{
        icon: Workflow,
        title: 'Connect a WhatsApp account',
        description:
          'Link your WhatsApp Business account to start setting up automated replies and workflows.',
        action: connectAction,
      }}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {selectedAccountId ? <AutoReplyManager accountId={selectedAccountId} /> : null}
    </ModuleShell>
  );
}
