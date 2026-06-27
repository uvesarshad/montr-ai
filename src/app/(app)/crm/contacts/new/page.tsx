'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContactForm } from '@/components/crm/contacts/contact-form';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { CreateContactInput, UpdateContactInput } from '@/validations/crm/contact.schema';
import { ModuleShell } from '@/components/shell/module-shell';

interface DuplicateRecord {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export default function NewContactPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupRecords, setDupRecords] = useState<DuplicateRecord[]>([]);
  const [pendingData, setPendingData] = useState<CreateContactInput | UpdateContactInput | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  const submit = async (
    data: CreateContactInput | UpdateContactInput,
    force = false,
  ) => {
    try {
      setIsSubmitting(true);

      const response = await fetch(
        `/api/v2/crm/contacts${force ? '?force=true' : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        },
      );

      if (response.status === 409) {
        const dup = await response.json();
        const records = (dup.duplicates || []).flatMap(
          (m: { records?: DuplicateRecord[] }) => m.records || [],
        );
        setDupRecords(records);
        setPendingData(data);
        setDupOpen(true);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create contact');
      }

      const newContact = await response.json();

      toast({
        title: 'Success',
        description: 'Contact created successfully',
      });

      router.push(`/crm/contacts/${newContact._id}`);
    } catch (error) {
      console.error('Error creating contact:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create contact',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (data: CreateContactInput | UpdateContactInput) => submit(data, false);

  const dupName = (r: DuplicateRecord) =>
    [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email || 'an existing contact';

  const handleCancel = () => {
    router.push('/crm/contacts');
  };

  return (
    <ModuleShell
      title="New Contact"
      breadcrumb={[{ label: 'Contacts', href: '/crm/contacts' }, { label: 'New' }]}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <div className="mx-auto w-full max-w-4xl">
        <Card className="rounded-xl border border-border bg-card">
          <CardContent className="pt-6">
            <ContactForm
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
            />
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        destructive={false}
        title="Possible duplicate"
        description={
          dupRecords.length
            ? `This looks like a duplicate of ${dupName(dupRecords[0])}${
                dupRecords.length > 1 ? ` and ${dupRecords.length - 1} other(s)` : ''
              }. Create anyway?`
            : 'A possible duplicate was found. Create anyway?'
        }
        confirmLabel="Create anyway"
        cancelLabel="View existing"
        onConfirm={() => {
          setDupOpen(false);
          if (pendingData) void submit(pendingData, true);
        }}
      >
        {dupRecords.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {dupRecords.slice(0, 5).map((r) => (
              <li key={r._id}>
                <a
                  href={`/crm/contacts/${r._id}`}
                  className="text-foreground underline underline-offset-2 hover:text-brand"
                >
                  {dupName(r)}
                </a>
                {r.email ? ` · ${r.email}` : ''}
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </ModuleShell>
  );
}
