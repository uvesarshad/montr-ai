'use client';

import { useState } from 'react';
import type React from 'react';
import { Company } from '@/types/crm';
import { CreateCompanyInput, UpdateCompanyInput } from '@/validations/crm/company.schema';
import { CompanyHeader } from './company-header';
import { CompanySidebar } from './company-sidebar';
import { CompanyOverview } from './company-overview';
import { CompanyDealsTab } from './company-deals-tab';
import { CompanyContactsTab } from './company-contacts-tab';
import { ActivityTimeline } from '../activities/activity-timeline';
import { CommentList } from '../comments/comment-list';
import { AttachmentList } from '../attachments/attachment-list';
import { AuditLogViewer } from '../shared/audit-log-viewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyForm } from './company-form';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DeleteConfirmationDialog } from '../shared/delete-confirmation-dialog';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { useRecordLayout } from '@/hooks/crm/use-record-layout';
import { visibleKeys, RECORD_LAYOUT_SECTIONS } from '../shared/record-layout-sections';

interface CompanyDetailProps {
  company: Company;
  onUpdate?: () => void;
}

export function CompanyDetail({ company, onUpdate }: CompanyDetailProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const { sections: layout } = useRecordLayout('company');
  const labels = Object.fromEntries(
    RECORD_LAYOUT_SECTIONS.company.map((s) => [s.key, s.label])
  );
  const mainKeys = visibleKeys(layout, 'main');
  const sideKeys = visibleKeys(layout, 'side');

  const mainContent: Record<string, React.ReactNode> = {
    overview: <CompanyOverview company={company} />,
    contacts: <CompanyContactsTab companyId={company._id} />,
    deals: <CompanyDealsTab companyId={company._id} />,
    timeline: <ActivityTimeline targetType="company" targetId={company._id} />,
    comments: <CommentList targetType="company" targetId={company._id} />,
    attachments: <AttachmentList targetType="company" targetId={company._id} />,
    history: <AuditLogViewer entityType="company" entityId={company._id} showFilters={true} />,
  };

  const handleAskAgent = () => {
    openAgentLauncher({
      prompt: 'Analyze this company and suggest the most important next sales or relationship actions.',
      context: {
        source: 'crm_company_detail',
        entityType: 'company',
        entityId: company._id,
        entityLabel: company.name,
        route: `/crm/companies/${company._id}`,
        notes: [
          company.industry ? `Industry: ${company.industry}` : '',
          company.type ? `Company type: ${company.type}` : '',
          company.size ? `Company size: ${company.size}` : '',
          company.website ? `Website: ${company.website}` : '',
          company.email ? `Email: ${company.email}` : '',
          `Contacts: ${company.contactCount}`,
          `Deals: ${company.dealCount}`,
          `Total deal value: ${company.totalDealValue}`,
        ].filter(Boolean),
      },
    });
  };

  const handleUpdate = async (data: CreateCompanyInput | UpdateCompanyInput) => {
    try {
      setIsSubmitting(true);

      const response = await fetch(`/api/v2/crm/companies/${company._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update company');
      }

      toast({
        title: 'Success',
        description: 'Company updated successfully',
      });

      setIsEditOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error updating company:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update company',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/v2/crm/companies/${company._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete company');
      }

      toast({
        title: 'Success',
        description: 'Company deleted successfully',
      });

      router.push('/crm/companies');
    } catch (error) {
      console.error('Error deleting company:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete company',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <CompanyHeader
          company={company}
          onAskAgent={handleAskAgent}
          onEdit={() => setIsEditOpen(true)}
          onDelete={() => setIsDeleteOpen(true)}
        />

        <div
          className={`grid grid-cols-1 gap-6 ${sideKeys.length ? 'lg:grid-cols-3' : ''}`}
        >
          {mainKeys.length > 0 && (
            <div className={sideKeys.length ? 'lg:col-span-2' : ''}>
              <Tabs defaultValue={mainKeys[0]} className="space-y-4">
                <div className="max-w-full overflow-x-auto">
                  <TabsList>
                    {mainKeys.map((key) => (
                      <TabsTrigger key={key} value={key}>
                        {labels[key] ?? key}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {mainKeys.map((key) => (
                  <TabsContent key={key} value={key} className="space-y-4">
                    {mainContent[key]}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}

          {sideKeys.includes('sidebar') && (
            <div className="lg:col-span-1">
              <CompanySidebar company={company} />
            </div>
          )}
        </div>
      </div>

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Company</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <CompanyForm
              company={company}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditOpen(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Company"
        description="Are you sure you want to delete this company? This action cannot be undone and will also affect related contacts and deals."
      />
    </>
  );
}
