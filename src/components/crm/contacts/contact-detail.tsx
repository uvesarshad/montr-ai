'use client';

import { useState } from 'react';
import type React from 'react';
import { Contact } from '@/types/crm';
import { buildContactInsight } from '@/lib/crm/ai-insights';
import { CreateContactInput, UpdateContactInput } from '@/validations/crm/contact.schema';
import { ContactHeader } from './contact-header';
import { ContactSidebar } from './contact-sidebar';
import { ContactOverview } from './contact-overview';
import { ContactEmailsTab } from './contact-emails-tab';
import { ContactFormsTab } from './contact-forms-tab';
import { ActivityTimeline } from '../activities/activity-timeline';
import { UnifiedTimeline } from './unified-timeline';
import { CommentList } from '../comments/comment-list';
import { AttachmentList } from '../attachments/attachment-list';
import { AuditLogViewer } from '../shared/audit-log-viewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContactForm } from './contact-form';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DeleteConfirmationDialog } from '../shared/delete-confirmation-dialog';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { useRecordLayout } from '@/hooks/crm/use-record-layout';
import { visibleKeys, RECORD_LAYOUT_SECTIONS } from '../shared/record-layout-sections';

interface ContactDetailProps {
  contact: Contact;
  onUpdate?: () => void;
}

export function ContactDetail({ contact, onUpdate }: ContactDetailProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { push } = useRouter();
  const contactInsight = buildContactInsight(contact);
  const { sections: layout } = useRecordLayout('contact');
  const labels = Object.fromEntries(
    RECORD_LAYOUT_SECTIONS.contact.map((s) => [s.key, s.label])
  );
  const mainKeys = visibleKeys(layout, 'main');
  const sideKeys = visibleKeys(layout, 'side');

  const mainContent: Record<string, React.ReactNode> = {
    overview: <ContactOverview contact={contact} />,
    timeline: <UnifiedTimeline contactId={contact._id} />,
    activities: <ActivityTimeline targetType="contact" targetId={contact._id} />,
    comments: <CommentList targetType="contact" targetId={contact._id} />,
    attachments: <AttachmentList targetType="contact" targetId={contact._id} />,
    emails: <ContactEmailsTab contactId={contact._id} />,
    forms: <ContactFormsTab contactId={contact._id} />,
    history: <AuditLogViewer entityType="contact" entityId={contact._id} showFilters={true} />,
  };

  const openAgent = () => {
    openAgentLauncher({
      prompt: contactInsight.prompt,
      context: {
        source: 'crm_contact_detail',
        entityType: 'contact',
        entityId: contact._id,
        entityLabel: `${contact.firstName} ${contact.lastName}`.trim(),
        route: `/crm/contacts/${contact._id}`,
        notes: [
          contact.email ? `Email: ${contact.email}` : '',
          contact.jobTitle ? `Role: ${contact.jobTitle}` : '',
          `Lifecycle: ${contact.lifecycle}`,
        ].filter((note): note is string => Boolean(note)),
      },
    });
  };

  const handleUpdate = async (data: CreateContactInput | UpdateContactInput) => {
    try {
      setIsSubmitting(true);

      const response = await fetch(`/api/v2/crm/contacts/${contact._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update contact');
      }

      toast({
        title: 'Success',
        description: 'Contact updated successfully',
      });

      setIsEditOpen(false);
      onUpdate?.();
    } catch (error) {
      console.error('Error updating contact:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update contact',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/v2/crm/contacts/${contact._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete contact');
      }

      toast({
        title: 'Success',
        description: 'Contact deleted successfully',
      });

      push('/crm/contacts');
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete contact',
      });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <ContactHeader
          contact={contact}
          onEdit={() => setIsEditOpen(true)}
          onDelete={() => setIsDeleteOpen(true)}
        />

        <Card className="border-border/40 bg-card/60 backdrop-blur-md">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{contactInsight.inferredSentiment} signal</Badge>
                  <Badge variant="secondary">AI summary</Badge>
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">{contactInsight.title}</h2>
                  <p className="text-sm leading-6 text-muted-foreground">{contactInsight.summary}</p>
                </div>
                <p className="text-sm">
                  <span className="font-medium text-foreground">Suggested next step:</span>{' '}
                  <span className="text-muted-foreground">{contactInsight.nextStep}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {contactInsight.evidence.map((item) => (
                    <Badge key={item} variant="outline" className="bg-background/60">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button onClick={openAgent} className="shrink-0">
                <Sparkles className="mr-2 size-4" />
                {contactInsight.actionLabel}
              </Button>
            </div>
          </CardContent>
        </Card>

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
              <ContactSidebar contact={contact} />
            </div>
          )}
        </div>
      </div>

      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Contact</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <ContactForm
              contact={contact}
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
        title="Delete Contact"
        description="Are you sure you want to delete this contact? This action cannot be undone."
      />
    </>
  );
}
