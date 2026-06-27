'use client';

import { useState } from 'react';
import { WebhookList } from '@/components/crm/webhooks/webhook-list';
import { WebhookForm } from '@/components/crm/webhooks/webhook-form';
import { WebhookLogs } from '@/components/crm/webhooks/webhook-logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ModuleShell } from '@/components/shell/module-shell';
import { Plus, Search, Webhook } from 'lucide-react';
import { useWebhook } from '@/hooks/crm/use-webhook';
import { useWebhooks } from '@/hooks/crm/use-webhooks';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function WebhooksPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [formSheetOpen, setFormSheetOpen] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const [editingWebhookId, setEditingWebhookId] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testWebhookId, setTestWebhookId] = useState<string | null>(null);
  const [testEvent, setTestEvent] = useState('webhook.test');
  const [testing, setTesting] = useState(false);
  const { test } = useWebhooks();
  const { toast } = useToast();

  const { webhook: editingWebhook } = useWebhook(editingWebhookId);
  const { webhook: testingWebhook } = useWebhook(testWebhookId);

  const handleCreate = () => {
    setEditingWebhookId(null);
    setFormSheetOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingWebhookId(id);
    setFormSheetOpen(true);
  };

  const handleTest = async (id: string) => {
    setTestWebhookId(id);
    setTestDialogOpen(true);
  };

  const handleViewLogs = (id: string) => {
    setSelectedWebhookId(id);
    setLogsDialogOpen(true);
  };

  const handleFormClose = () => {
    setFormSheetOpen(false);
    setEditingWebhookId(null);
  };

  const handleRunTest = async () => {
    if (!testWebhookId) {
      return;
    }

    setTesting(true);
    try {
      await test(testWebhookId, testEvent);
      toast({
        title: 'Test sent',
        description: 'The sample webhook payload has been dispatched.',
      });
      setTestDialogOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Test failed',
        description: error instanceof Error ? error.message : 'Failed to send test webhook.',
      });
    } finally {
      setTesting(false);
    }
  };

  const filterBar = (
    <div className="flex items-center gap-2">
      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search webhooks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 pl-8"
        />
      </div>
    </div>
  );

  const webhooksPrimaryAction = (
    <Button size="sm" onClick={handleCreate}>
      <Plus className="size-4 mr-2" />
      New Webhook
    </Button>
  );

  return (
    <ModuleShell
      title="Webhooks"
      icon={Webhook}
      meta="Manage outgoing webhooks for external integrations"
      primaryAction={webhooksPrimaryAction}
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <WebhookList
        onEdit={handleEdit}
        onTest={handleTest}
        onViewLogs={handleViewLogs}
      />

      <Sheet open={formSheetOpen} onOpenChange={setFormSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingWebhookId ? 'Edit Webhook' : 'Create Webhook'}</SheetTitle>
            <SheetDescription>
              {editingWebhookId
                ? 'Update your webhook configuration'
                : 'Configure a new webhook for external integrations'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <WebhookForm
              webhookId={editingWebhookId || undefined}
              initialData={editingWebhook || undefined}
              onCancel={handleFormClose}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Webhook Delivery Logs</DialogTitle>
            <DialogDescription>
              View the delivery history and results of this webhook
            </DialogDescription>
          </DialogHeader>
          {selectedWebhookId && <WebhookLogs webhookId={selectedWebhookId} />}
        </DialogContent>
      </Dialog>

      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Test Webhook</DialogTitle>
            <DialogDescription>
              Send a sample event to {testingWebhook?.name || 'this webhook'}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-event">Test Event</Label>
              <Select value={testEvent} onValueChange={setTestEvent}>
                <SelectTrigger id="test-event">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(testingWebhook?.events || ['webhook.test']).map((event) => (
                    <SelectItem key={event} value={event}>
                      {event}
                    </SelectItem>
                  ))}
                  {(testingWebhook?.events as string[] | undefined)?.includes('webhook.test') ? null : (
                    <SelectItem value="webhook.test">webhook.test</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {testingWebhook?.url ? (
              <div className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
                Target: <span className="font-mono text-foreground">{testingWebhook.url}</span>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setTestDialogOpen(false)} disabled={testing}>
              Cancel
            </Button>
            <Button onClick={handleRunTest} disabled={testing}>
              {testing ? 'Sending...' : 'Send Test'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}
