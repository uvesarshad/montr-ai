'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { DollarSign, Plus, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DashboardEmptyState,
  DashboardFooterLink,
  DashboardPanel,
  DashboardPanelHeader,
} from '@/components/dashboard/dashboard-primitives';
import { useContacts } from '@/hooks/crm/use-contacts';
import { useDeals } from '@/hooks/crm/use-deals';
import { formatCurrency } from '@/lib/utils';

const DEAL_FILTERS = { limit: 5, sort: '-createdAt' };
const CONTACT_FILTERS = { limit: 5, sort: '-createdAt' };

type DealPreview = {
  company?: { name?: string };
  stage?: { name?: string };
};

type ContactPreview = {
  avatarUrl?: string;
  status?: string;
};

export function RecentCRM() {
  const [activeTab, setActiveTab] = useState('deals');
  const { deals, loading: isDealsLoading } = useDeals(DEAL_FILTERS);
  const { contacts, loading: isContactsLoading } = useContacts(CONTACT_FILTERS);

  const createHref = activeTab === 'deals' ? '/crm/deals/new' : '/crm/contacts/new';
  const browseHref = activeTab === 'deals' ? '/crm/deals' : '/crm/contacts';

  return (
    <DashboardPanel>
      <DashboardPanelHeader
        eyebrow="CRM"
        title="Pipeline Activity"
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

      <Tabs defaultValue="deals" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-5 pt-4">
          <TabsList className="grid h-9 w-full grid-cols-2 rounded-[12px] bg-muted/50 p-1">
            <TabsTrigger
              value="deals"
              className="rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              Deals
            </TabsTrigger>
            <TabsTrigger
              value="contacts"
              className="rounded-lg text-xs data-[state=active]:bg-background data-[state=active]:shadow-none"
            >
              Contacts
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="deals" className="mt-0">
          <CardContent className="p-0">
            {isDealsLoading ? (
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
            ) : deals.length > 0 ? (
              <div className="divide-y divide-border/60">
                {deals.map((deal) => {
                  const dealPreview = deal as typeof deal & DealPreview;
                  const companyName = dealPreview.company?.name;
                  const stageName = dealPreview.stage?.name;

                  return (
                  <Link
                    key={deal._id}
                    href={`/crm/deals/${deal._id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background/60"
                  >
                    <div className="flex size-10 items-center justify-center rounded-[12px] bg-emerald-500/10 text-emerald-500">
                      <DollarSign className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{deal.name}</p>
                        <Badge
                          variant="outline"
                          className="rounded-full border-emerald-500/20 bg-emerald-500/10 text-[10px] uppercase tracking-[0.16em] text-emerald-500"
                        >
                          {formatCurrency(deal.value, deal.currency)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {companyName ? <span>{companyName}</span> : null}
                        {companyName && stageName ? (
                          <span className="hidden size-1 rounded-full bg-border sm:block" />
                        ) : null}
                        {stageName ? <span>{stageName}</span> : null}
                        {deal.updatedAt ? (
                          <>
                            <span className="hidden size-1 rounded-full bg-border sm:block" />
                            <span>
                              {formatDistanceToNow(new Date(deal.updatedAt), { addSuffix: true })}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            ) : (
              <DashboardEmptyState
                icon={DollarSign}
                title="No deals yet"
                description="Create the first deal to keep pipeline movement visible from the dashboard."
              />
            )}
          </CardContent>
        </TabsContent>

        <TabsContent value="contacts" className="mt-0">
          <CardContent className="p-0">
            {isContactsLoading ? (
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
            ) : contacts && contacts.length > 0 ? (
              <div className="divide-y divide-border/60">
                {contacts.map((contact) => {
                  const contactPreview = contact as typeof contact & ContactPreview;

                  return (
                  <Link
                    key={contact._id}
                    href={`/crm/contacts/${contact._id}`}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background/60"
                  >
                    <Avatar className="size-10 border border-border/60">
                      <AvatarImage src={contactPreview.avatarUrl} />
                      <AvatarFallback className="text-xs">
                        {contact.firstName?.substring(0, 1)}
                        {contact.lastName?.substring(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {contact.firstName} {contact.lastName}
                        </p>
                        {contactPreview.status ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-border/60 bg-background/70 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                          >
                            {contactPreview.status}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{contact.email}</span>
                        {contact.createdAt ? (
                          <>
                            <span className="hidden size-1 rounded-full bg-border sm:block" />
                            <span>
                              {formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                  );
                })}
              </div>
            ) : (
              <DashboardEmptyState
                icon={Users}
                title="No contacts yet"
                description="Add the first contact to keep CRM activity represented in the workspace overview."
              />
            )}
          </CardContent>
        </TabsContent>
      </Tabs>

      <DashboardFooterLink
        href={browseHref}
        label={activeTab === 'deals' ? 'Open Deal Pipeline' : 'Browse All Contacts'}
      />
    </DashboardPanel>
  );
}
