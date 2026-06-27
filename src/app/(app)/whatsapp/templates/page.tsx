'use client';

import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui-kit';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import { TemplateBuilder } from '@/components/whatsapp/templates/template-builder';
import { TemplateListManager } from '@/components/whatsapp/templates/template-list-manager';
import {
  useWhatsAppAccount,
  WhatsAppAccountSelect,
} from '@/components/whatsapp/whatsapp-account-context';

export default function WhatsAppTemplatesPage() {
  const { accounts, loading, selectedAccountId, refetch } = useWhatsAppAccount();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [listKey, setListKey] = useState(0);

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

  const newTemplateAction = selectedAccountId ? (
    <Button size="sm" icon={Plus} onClick={() => setBuilderOpen(true)}>
      New template
    </Button>
  ) : undefined;

  return (
    <>
      <ModuleShell
        title="Templates"
        icon={FileText}
        secondaryActions={accounts.length > 0 ? <WhatsAppAccountSelect /> : undefined}
        primaryAction={accounts.length > 0 ? newTemplateAction : undefined}
        isLoading={loading}
        isEmpty={!loading && accounts.length === 0}
        emptyState={{
          icon: FileText,
          title: 'Connect a WhatsApp account',
          description:
            'Link your WhatsApp Business account to create and manage message templates.',
          action: connectAction,
        }}
        contentClassName="flex flex-col gap-3 pb-8"
      >
        {selectedAccountId ? (
          <TemplateListManager key={listKey} accountId={selectedAccountId} />
        ) : null}
      </ModuleShell>

      {selectedAccountId && (
        <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Template</DialogTitle>
            </DialogHeader>
            <TemplateBuilder
              accountId={selectedAccountId}
              onSuccess={() => {
                setBuilderOpen(false);
                setListKey((k) => k + 1);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
