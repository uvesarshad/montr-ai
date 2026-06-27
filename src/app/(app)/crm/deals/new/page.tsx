'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DealForm } from '@/components/crm/deals/deal-form';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CreateDealInput, UpdateDealInput } from '@/validations/crm/deal.schema';
import { ModuleShell } from '@/components/shell/module-shell';

export default function NewDealPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async (data: CreateDealInput | UpdateDealInput) => {
    try {
      setIsSubmitting(true);

      const response = await fetch('/api/v2/crm/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create deal');
      }

      const newDeal = await response.json();

      toast({
        title: 'Success',
        description: 'Deal created successfully',
      });

      // Navigate to the new deal's detail page
      router.push(`/crm/deals/${newDeal._id}`);
    } catch (error) {
      console.error('Error creating deal:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create deal',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <ModuleShell
      title="New Deal"
      breadcrumb={[{ label: 'Deals', href: '/crm/deals' }, { label: 'New' }]}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <div className="mx-auto w-full max-w-4xl">
        <Card className="rounded-xl border border-border bg-card">
          <CardContent className="pt-6">
            <DealForm
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </CardContent>
        </Card>
      </div>
    </ModuleShell>
  );
}
