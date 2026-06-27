'use client';

import { MessageCircle, Plus } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui-kit';
import { AnalyticsDashboard } from '@/components/whatsapp/analytics/analytics-dashboard';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import {
  useWhatsAppAccount,
  WhatsAppAccountSelect,
} from '@/components/whatsapp/whatsapp-account-context';

export default function WhatsAppOverviewPage() {
  const { accounts, loading, selectedAccountId, selectedAccount, refetch } = useWhatsAppAccount();

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
      title="Overview"
      icon={MessageCircle}
      meta={selectedAccount?.displayPhoneNumber || selectedAccount?.name}
      secondaryActions={accounts.length > 0 ? <WhatsAppAccountSelect /> : undefined}
      primaryAction={accounts.length > 0 ? connectAction : undefined}
      isLoading={loading}
      isEmpty={!loading && accounts.length === 0}
      emptyState={{
        icon: MessageCircle,
        title: 'Connect a WhatsApp account',
        description:
          'Link your WhatsApp Business account to send campaigns, build automations, and track delivery.',
        action: connectAction,
      }}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {selectedAccountId ? <AnalyticsDashboard accountId={selectedAccountId} /> : null}
    </ModuleShell>
  );
}
