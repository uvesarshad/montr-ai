'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

import { useAppHeader } from '@/components/app-header';
import { WorkflowList } from '@/components/crm/workflows/workflow-list';
import { Banner, Button, SearchInput } from '@/components/ui-kit';
import { ArrowRight } from 'lucide-react';

export default function WorkflowsPage() {
  const { push: routerPush } = useRouter();
  const { setHeaderInfo } = useAppHeader();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Workflows',
      description: 'Automate CRM tasks with trigger-based workflows',
      actions: (
        <Button variant="brand" size="sm" icon={Plus} onClick={() => routerPush('/crm/workflows/new')}>
          New Workflow
        </Button>
      ),
    });
    return () => setHeaderInfo(null);
  }, [routerPush, setHeaderInfo]);

  return (
    <div className="space-y-4 p-6">
      <Banner
        tone="brand"
        title="CRM workflows are now part of the automation builder"
        action={
          <Button
            size="sm"
            variant="brand"
            icon={ArrowRight}
            onClick={() => routerPush('/canvas')}
          >
            Open builder
          </Button>
        }
      >
        Existing workflows still run, but new automations are built in the unified canvas.
      </Banner>
      <SearchInput
        placeholder="Search workflows…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        wrapClassName="max-w-sm"
      />
      <WorkflowList
        searchQuery={searchQuery}
        onEdit={id => routerPush(`/crm/workflows/${id}`)}
        onViewLogs={id => routerPush(`/crm/workflows/${id}?tab=logs`)}
      />
    </div>
  );
}
