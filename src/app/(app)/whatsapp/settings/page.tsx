'use client';

import { MessageCircle, Plus, Phone, CheckCircle2 } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button, Card, Chip } from '@/components/ui-kit';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import { useWhatsAppAccount } from '@/components/whatsapp/whatsapp-account-context';

export default function WhatsAppSettingsPage() {
  const { accounts, loading, refetch } = useWhatsAppAccount();

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
      title="Settings"
      icon={MessageCircle}
      meta="Connected accounts"
      primaryAction={connectAction}
      isLoading={loading}
      isEmpty={!loading && accounts.length === 0}
      emptyState={{
        icon: MessageCircle,
        title: 'No WhatsApp accounts',
        description: 'Connect a WhatsApp Business account to start sending campaigns and automations.',
        action: connectAction,
      }}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map((account) => (
          <Card key={account._id} bodyClassName="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{account.name}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Phone className="size-3.5" />
                  {account.displayPhoneNumber || account.phoneNumber || '—'}
                </p>
                {account.wabaId ? (
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">WABA: {account.wabaId}</p>
                ) : null}
              </div>
              <Chip tone="ok" icon={CheckCircle2}>Connected</Chip>
            </div>
          </Card>
        ))}
      </div>
    </ModuleShell>
  );
}
