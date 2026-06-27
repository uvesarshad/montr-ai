'use client';

import { useCallback, useEffect, useState } from 'react';
import { Send, Plus, Calendar, Users } from 'lucide-react';

import { ModuleShell } from '@/components/shell/module-shell';
import { Button, Card, Chip, EmptyState, type ChipTone } from '@/components/ui-kit';
import { ConnectAccountDialog } from '@/components/whatsapp/connect-account-dialog';
import { CreateCampaignDialog } from '@/components/whatsapp/create-campaign-dialog';
import { CampaignMonitoringDashboard } from '@/components/whatsapp/campaigns/campaign-monitoring-dashboard';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useWhatsAppAccount,
  WhatsAppAccountSelect,
} from '@/components/whatsapp/whatsapp-account-context';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  _id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'processing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  audienceType?: string;
  totalContacts?: number;
  stats?: {
    sent?: number;
    delivered?: number;
    read?: number;
    failed?: number;
  };
  scheduledAt?: string;
  createdAt?: string;
}

interface Template {
  _id: string;
  name?: string;
  accountId?: string;
  whatsappAccountId?: string;
  language?: string;
  status?: string;
  category?: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<Campaign['status'], { label: string; tone: ChipTone; dot?: boolean }> = {
    running: { label: 'Running', tone: 'brand', dot: true },
    completed: { label: 'Completed', tone: 'ok' },
    failed: { label: 'Failed', tone: 'danger' },
    cancelled: { label: 'Cancelled', tone: 'gray' },
    paused: { label: 'Paused', tone: 'gray' },
    draft: { label: 'Draft', tone: 'gray' },
    scheduled: { label: 'Scheduled', tone: 'warn' },
    processing: { label: 'Processing', tone: 'brand', dot: true },
  };

  const { label, tone, dot } = map[status] ?? { label: status, tone: 'gray' as ChipTone };

  return (
    <Chip tone={tone} dot={dot}>
      {label}
    </Chip>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WhatsAppCampaignsPage() {
  const { accounts, loading: accountsLoading, selectedAccountId, refetch } = useWhatsAppAccount();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [monitoringCampaignId, setMonitoringCampaignId] = useState<string | null>(null);

  // ── Fetch campaigns (org-scoped, no accountId param needed) ──────────────
  const fetchCampaigns = useCallback(async () => {
    if (accounts.length === 0) return;
    setCampaignsLoading(true);
    try {
      const res = await fetch('/api/whatsapp/campaigns?limit=50&offset=0', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setCampaigns(data.campaigns ?? []);
    } catch {
      setCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }, [accounts.length]);

  // ── Fetch templates for the selected account (for CreateCampaignDialog) ──
  const fetchTemplates = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const res = await fetch(`/api/whatsapp/templates/sync`, {
        method: 'HEAD', // just check existence — we load templates via their own sync endpoint
        credentials: 'include',
      }).catch(() => null);
      void res; // templates are fetched inside CreateCampaignDialog logic from stored DB records

      // Fetch approved templates stored in DB via a generic templates list if available
      // Since there is no GET /api/whatsapp/templates, we pass an empty array and let
      // CreateCampaignDialog's own template fetch handle it (it filters accountTemplates inline).
      setTemplates([]);
    } catch {
      setTemplates([]);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isLoading = accountsLoading || (accounts.length > 0 && campaignsLoading);
  const hasNoAccounts = !accountsLoading && accounts.length === 0;
  const monitoredCampaign = monitoringCampaignId
    ? campaigns.find((c) => c._id === monitoringCampaignId) ?? null
    : null;

  // ── Actions ───────────────────────────────────────────────────────────────
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

  const createAction = accounts.length > 0 ? (
    <CreateCampaignDialog
      accounts={accounts as unknown as Array<{ _id: string; [key: string]: unknown }>}
      templates={templates as unknown as Array<{ _id: string; [key: string]: unknown }>}
      onSuccess={fetchCampaigns}
      trigger={
        <Button size="sm" icon={Plus}>
          New campaign
        </Button>
      }
    />
  ) : undefined;

  return (
    <>
      <ModuleShell
        title="Campaigns"
        icon={Send}
        secondaryActions={accounts.length > 0 ? <WhatsAppAccountSelect /> : undefined}
        primaryAction={createAction}
        isLoading={isLoading}
        isEmpty={hasNoAccounts}
        emptyState={{
          icon: Send,
          title: 'Connect a WhatsApp account first',
          description:
            'Link your WhatsApp Business account to start sending bulk campaigns to your contacts.',
          action: connectAction,
        }}
        contentClassName="flex flex-col gap-3 pb-8"
      >
        {/* No campaigns yet — account exists but list is empty */}
        {!campaignsLoading && campaigns.length === 0 ? (
          <Card>
            <EmptyState
              icon={Send}
              title="No campaigns yet"
              note="Create your first campaign to send template messages to your WhatsApp contacts at scale."
              cta={createAction}
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {campaigns.map((campaign) => {
              const sent = campaign.stats?.sent ?? 0;
              const total = campaign.totalContacts ?? 0;
              const createdAt = campaign.createdAt
                ? new Date(campaign.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : null;
              const scheduledAt = campaign.scheduledAt
                ? new Date(campaign.scheduledAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : null;

              return (
                <Card key={campaign._id} lift bodyClassName="flex items-center gap-4 p-4">
                  {/* Left: name + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-foreground">
                        {campaign.name}
                      </span>
                      <StatusBadge status={campaign.status} />
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
                      {total > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="size-3.5" />
                          {total.toLocaleString()} recipients
                        </span>
                      )}
                      {sent > 0 && (
                        <span className="flex items-center gap-1">
                          <Send className="size-3.5" />
                          {sent.toLocaleString()} sent
                        </span>
                      )}
                      {scheduledAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          {scheduledAt}
                        </span>
                      )}
                      {!scheduledAt && createdAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          Created {createdAt}
                        </span>
                      )}
                      {campaign.audienceType && campaign.audienceType !== 'all' && (
                        <span className="capitalize">{campaign.audienceType} audience</span>
                      )}
                    </div>
                  </div>

                  {/* Right: monitor button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setMonitoringCampaignId(campaign._id)}
                  >
                    View stats
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </ModuleShell>

      {/* Campaign monitoring dialog */}
      <Dialog
        open={Boolean(monitoringCampaignId)}
        onOpenChange={(open) => {
          if (!open) setMonitoringCampaignId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {monitoredCampaign?.name ?? 'Campaign Stats'}
            </DialogTitle>
          </DialogHeader>
          {monitoringCampaignId && (
            <CampaignMonitoringDashboard
              campaignId={monitoringCampaignId}
              onClose={() => setMonitoringCampaignId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
