'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { useAppHeader } from '@/components/app-header';
import { WorkflowForm } from '@/components/crm/workflows/workflow-form';
import { Button } from '@/components/ui-kit';

export default function NewWorkflowPage() {
  const router = useRouter();
  const { setHeaderInfo } = useAppHeader();

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'New Workflow',
      description: 'Create a new automation workflow',
      actions: (
        <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => router.push('/crm/workflows')}>
          Back
        </Button>
      ),
    });
    return () => setHeaderInfo(null);
  }, [router, setHeaderInfo]);

  return (
    <div className="max-w-2xl p-6">
      <WorkflowForm onSuccess={id => router.push(`/crm/workflows/${id}`)} />
    </div>
  );
}
