'use client';

import { BarChart3, Plus } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui-kit';
import { AnalyticsCharts } from '@/components/whatsapp/analytics/analytics-charts';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import {
  useWhatsAppAccount,
  WhatsAppAccountSelect,
} from '@/components/whatsapp/whatsapp-account-context';

export default function WhatsAppAnalyticsPage() {
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
      title="Analytics"
      icon={BarChart3}
      secondaryActions={accounts.length > 0 ? <WhatsAppAccountSelect /> : undefined}
      isLoading={loading}
      isEmpty={!loading && accounts.length === 0}
      emptyState={{
        icon: BarChart3,
        title: 'No WhatsApp accounts',
        description: 'Connect a WhatsApp account to see analytics.',
        action: connectAction,
      }}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {selectedAccountId ? <AnalyticsCharts accountId={selectedAccountId} /> : null}
    </ModuleShell>
  );
}
