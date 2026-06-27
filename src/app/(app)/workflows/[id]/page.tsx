'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppHeader } from '@/components/app-header';
import { WorkflowForm } from '@/components/crm/workflows/workflow-form';
import { WorkflowLogs } from '@/components/crm/workflows/workflow-logs';
import { useWorkflow } from '@/hooks/crm/use-workflow';
import { Button, Skeleton, Tabs, EmptyState } from '@/components/ui-kit';
import { ArrowLeft, GitBranch } from 'lucide-react';

interface WorkflowDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function WorkflowDetailPage({ params }: WorkflowDetailPageProps) {
  const { id } = use(params);
  const { push: routerPush } = useRouter();
  const searchParams = useSearchParams();
  const { setHeaderInfo } = useAppHeader();
  const { workflow, logs, loading, logsLoading } = useWorkflow(id);

  const defaultTab = searchParams.get('tab') ?? 'edit';
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: loading ? 'Workflow' : (workflow?.name ?? 'Workflow'),
      description: 'Edit workflow and view execution logs',
      actions: (
        <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => routerPush('/crm/workflows')}>
          All Workflows
        </Button>
      ),
    });
    return () => setHeaderInfo(null);
  }, [loading, workflow, routerPush, setHeaderInfo]);

  if (loading) {
    return (
      <div className="p-6 max-w-2xl space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="p-6">
        <EmptyState
          icon={GitBranch}
          title="Workflow not found"
          note="This workflow may have been deleted or you may not have access."
          cta={
            <Button variant="outline" size="sm" onClick={() => routerPush('/crm/workflows')}>
              Back to workflows
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Tabs
        tabs={[
          { value: 'edit', label: 'Edit' },
          { value: 'logs', label: 'Execution Logs' },
        ]}
        value={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />
      {activeTab === 'edit' && (
        <WorkflowForm
          workflow={workflow}
          onSuccess={() => routerPush('/crm/workflows')}
        />
      )}
      {activeTab === 'logs' && (
        <WorkflowLogs logs={logs} loading={logsLoading} />
      )}
    </div>
  );
}
