'use client';

import { CrmOverview } from '@/components/crm/dashboard/crm-overview';
import { AddDealButton } from '@/components/crm/deals/add-deal-button';
import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui/button';
import { FileUp, LayoutDashboard, Plus, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function CrmDashboardPage() {
  return (
    <ModuleShell
      title="Dashboard"
      icon={LayoutDashboard}
      meta="Pipeline & activities"
      secondaryActions={
        <>
          <Link href="/crm/import">
            <Button variant="outline" size="sm">
              <FileUp className="mr-2 size-4" />
              Import
            </Button>
          </Link>
          <Link href="/crm/contacts/new">
            <Button variant="outline" size="sm">
              <UserPlus className="mr-2 size-4" />
              New Contact
            </Button>
          </Link>
        </>
      }
      primaryAction={
        <AddDealButton>
          <Button size="sm">
            <Plus className="mr-2 size-4" />
            New Deal
          </Button>
        </AddDealButton>
      }
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <CrmOverview />
    </ModuleShell>
  );
}
