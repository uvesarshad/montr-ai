'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ImportWizard } from '@/components/crm/import/import-wizard';
import { ModuleShell } from '@/components/shell/module-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUp, Users, Building2 } from 'lucide-react';

export default function ImportPage() {
  const searchParams = useSearchParams();
  const [entityType, setEntityType] = useState<'contact' | 'company'>(
    (searchParams.get('type') as 'contact' | 'company') || 'contact'
  );

  return (
    <ModuleShell
      title="Import"
      icon={FileUp}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <Tabs value={entityType} onValueChange={(value) => setEntityType(value as 'contact' | 'company')}>
        <TabsList>
          <TabsTrigger value="contact" className="space-x-2">
            <Users className="size-4" />
            <span>Import Contacts</span>
          </TabsTrigger>
          <TabsTrigger value="company" className="space-x-2">
            <Building2 className="size-4" />
            <span>Import Companies</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contact" className="mt-6">
          <ImportWizard entityType="contact" />
        </TabsContent>

        <TabsContent value="company" className="mt-6">
          <ImportWizard entityType="company" />
        </TabsContent>
      </Tabs>

      {/* Help Section */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Import Guidelines</h3>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>File Format:</strong> Upload CSV files only (max 10MB)
          </p>
          <p>
            <strong>Required Fields:</strong>
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Contacts: Email or First Name (at least one required)</li>
            <li>Companies: Company Name (required)</li>
          </ul>
          <p>
            <strong>Duplicate Handling:</strong>
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Skip: Ignore duplicate records</li>
            <li>Update: Update existing records with new data</li>
            <li>Create: Create new records even if duplicates exist</li>
          </ul>
          <p>
            <strong>Tips:</strong>
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Use clear column headers that match CRM field names</li>
            <li>Remove any special characters or formatting from the CSV</li>
            <li>Ensure email addresses are in valid format</li>
            <li>Test with a small batch first (10-20 rows)</li>
          </ul>
        </div>
      </div>
    </ModuleShell>
  );
}
