'use client';

import { useState } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import { CustomFieldList } from '@/components/crm/custom-fields/custom-field-list';
import { CustomFieldForm } from '@/components/crm/custom-fields/custom-field-form';
import { CustomField } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useCustomFields } from '@/hooks/crm/use-custom-fields';
import { Plus, SlidersHorizontal } from 'lucide-react';

type EntityType = 'contact' | 'company' | 'deal';

export default function CustomFieldsPage() {
  const [activeTab, setActiveTab] = useState<EntityType>('contact');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  const { refetch } = useCustomFields({ entityType: activeTab });

  const handleCreate = () => {
    setEditingField(null);
    setSheetOpen(true);
  };

  const handleEdit = (field: CustomField) => {
    setEditingField(field);
    setSheetOpen(true);
  };

  const handleSuccess = () => {
    setSheetOpen(false);
    setEditingField(null);
    refetch();
  };

  const handleCancel = () => {
    setSheetOpen(false);
    setEditingField(null);
  };

  return (
    <ModuleShell
      title="Custom Fields"
      icon={SlidersHorizontal}
      meta="Add custom fields to contacts, companies, and deals"
      primaryAction={
        <Button size="sm" onClick={handleCreate}>
          <Plus className="size-4 mr-2" />
          Add Field
        </Button>
      }
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as EntityType)}>
        <TabsList>
          <TabsTrigger value="contact">Contacts</TabsTrigger>
          <TabsTrigger value="company">Companies</TabsTrigger>
          <TabsTrigger value="deal">Deals</TabsTrigger>
        </TabsList>

        <TabsContent value="contact" className="mt-4">
          <CustomFieldList entityType="contact" onEdit={handleEdit} />
        </TabsContent>
        <TabsContent value="company" className="mt-4">
          <CustomFieldList entityType="company" onEdit={handleEdit} />
        </TabsContent>
        <TabsContent value="deal" className="mt-4">
          <CustomFieldList entityType="deal" onEdit={handleEdit} />
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingField ? 'Edit Field' : `New ${activeTab} field`}</SheetTitle>
            <SheetDescription>
              {editingField
                ? 'Update the field label, options, and visibility settings.'
                : `Add a custom field to ${activeTab}s in your CRM.`}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <CustomFieldForm
              key={editingField?._id ?? 'new'}
              entityType={activeTab}
              field={editingField ?? undefined}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
            />
          </div>
        </SheetContent>
      </Sheet>
    </ModuleShell>
  );
}
