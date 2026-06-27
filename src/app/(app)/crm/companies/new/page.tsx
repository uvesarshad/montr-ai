'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CompanyForm } from '@/components/crm/companies/company-form';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CreateCompanyInput, UpdateCompanyInput } from '@/validations/crm/company.schema';
import { ModuleShell } from '@/components/shell/module-shell';

export default function NewCompanyPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = async (data: CreateCompanyInput | UpdateCompanyInput) => {
    try {
      setIsSubmitting(true);

      const response = await fetch('/api/v2/crm/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create company');
      }

      const newCompany = await response.json();

      toast({
        title: 'Success',
        description: 'Company created successfully',
      });

      router.push(`/crm/companies/${newCompany._id}`);
    } catch (error) {
      console.error('Error creating company:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create company',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/crm/companies');
  };

  return (
    <ModuleShell
      title="New Company"
      breadcrumb={[{ label: 'Companies', href: '/crm/companies' }, { label: 'New' }]}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <div className="mx-auto w-full max-w-4xl">
        <Card className="rounded-xl border border-border bg-card">
          <CardContent className="pt-6">
            <CompanyForm
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
