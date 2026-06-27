'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { BarChart2, Mail, MessageCircle, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DashboardEmptyState,
  DashboardFooterLink,
  DashboardPanel,
  DashboardPanelHeader,
} from '@/components/dashboard/dashboard-primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type CampaignPreview = {
  _id: string;
  name: string;
  status: string;
  createdAt?: string | Date;
  stats?: {
    sent?: number;
  };
};

export function RecentMarketing() {
  const [activeTab, setActiveTab] = useState('email');

  const { data: emailStats, isLoading: isEmailLoading } = useQuery<{ recentCampaigns?: CampaignPreview[] }>({
    queryKey: ['marketing-stats'],
    queryFn: async () => {
      const res = await fetch('/api/v2/marketing-email/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
  });

  const { data: whatsappData, isLoading: isWhatsAppLoading } = useQuery<{ campaigns?: CampaignPreview[] }>({
    queryKey: ['whatsapp-campaigns-recent'],
    queryFn: async () => {
      const res = await fetch('/api/whatsapp/campaigns?limit=5');
      if (!res.ok) throw new Error('Failed to fetch whatsapp campaigns');
      return res.json();
    },
  });

  const recentEmailCampaigns = emailStats?.recentCampaigns || [];
  const recentWhatsAppCampaigns = whatsappData?.campaigns || [];

  const createHref =
    activeTab === 'email' ? '/campaigns/new?channel=email' : '/campaigns/new?channel=whatsapp';
  const dashboardHref =
    activeTab === 'email' ? '/campaigns/dashboard?channel=email' : '/campaigns?channel=whatsapp';

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        eyebrow="Marketing"
        title="Campaign Activity"
        actions={
          <Link href={createHref}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-[0.4rem] border-border/60 bg-background/70 px-3 text-xs"
            >
              <Plus className="size-3.5" />
              New
            </Button>
          </Link>
        }
      />

      <Tabs defaultValue="email" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-5 pt-4">
          <TabsList className="grid h-9 w-full grid-cols-2 rounded-[12px] bg-muted/50 p-1">
            <TabsTrigger
              value="email"
              className="rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              Email
            </TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className="rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              WhatsApp
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="email" className="mt-0">
          <CardContent className="p-0">
            {isEmailLoading ? (
              <div className="space-y-3 px-5 py-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <Skeleton className="size-10 rounded-[12px]" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentEmailCampaigns.length > 0 ? (
              <div className="divide-y divide-border/60">
                {recentEmailCampaigns.map((campaign: CampaignPreview) => (
                  <Link
                    key={campaign._id}
                    href={`/campaigns/${campaign._id}?channel=email`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background/60"
                  >
                    <div className="flex size-10 items-center justify-center rounded-[12px] bg-indigo-500/10 text-indigo-500">
                      <Mail className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{campaign.name}</p>
                        <Badge
                          variant="outline"
                          className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          {campaign.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BarChart2 className="size-3" />
                          {campaign.stats?.sent || 0} sent
                        </span>
                        {campaign.createdAt ? (
                          <>
                            <span className="hidden size-1 rounded-full bg-border sm:block" />
                            <span>
                              {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <DashboardEmptyState
                icon={Mail}
                title="No email campaigns"
                description="Start the first email campaign and track delivery from the dashboard."
              />
            )}
          </CardContent>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-0">
          <CardContent className="p-0">
            {isWhatsAppLoading ? (
              <div className="space-y-3 px-5 py-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <Skeleton className="size-10 rounded-[12px]" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentWhatsAppCampaigns.length > 0 ? (
              <div className="divide-y divide-border/60">
                {recentWhatsAppCampaigns.map((campaign: CampaignPreview) => (
                  <Link
                    key={campaign._id}
                    href={`/campaigns/${campaign._id}?channel=whatsapp`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background/60"
                  >
                    <div className="flex size-10 items-center justify-center rounded-[12px] bg-emerald-500/10 text-emerald-500">
                      <MessageCircle className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{campaign.name}</p>
                        <Badge
                          variant="outline"
                          className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          {campaign.status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <BarChart2 className="size-3" />
                          {campaign.stats?.sent || 0} sent
                        </span>
                        {campaign.createdAt ? (
                          <>
                            <span className="hidden size-1 rounded-full bg-border sm:block" />
                            <span>
                              {formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <DashboardEmptyState
                icon={MessageCircle}
                title="No WhatsApp campaigns"
                description="Launch the first WhatsApp campaign to start seeing activity here."
              />
            )}
          </CardContent>
        </TabsContent>
      </Tabs>

      <DashboardFooterLink
        href={dashboardHref}
        label={activeTab === 'email' ? 'Open Email Dashboard' : 'Open WhatsApp Dashboard'}
      />
    </DashboardPanel>
  );
}

