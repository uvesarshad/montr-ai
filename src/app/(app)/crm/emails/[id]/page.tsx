'use client';

import { useParams } from 'next/navigation';
import { useEmail, useEmailThread } from '@/hooks/crm/use-emails';
import { EmailDetail } from '@/components/crm/emails/email-detail';
import { EmailThread } from '@/components/crm/emails/email-thread';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EmailDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { email, loading, error } = useEmail(id);
  const { emails: threadEmails, loading: _threadLoading } = useEmailThread(email?.threadId || '');

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading email...</div>
      </div>
    );
  }

  if (error || !email) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="text-destructive">{error || 'Email not found'}</div>
        <Link href="/crm/emails">
          <Button variant="outline">
            <ArrowLeft className="mr-2 size-4" />
            Back to Emails
          </Button>
        </Link>
      </div>
    );
  }

  const showThread = threadEmails.length > 1;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <Link href="/crm/emails">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 size-4" />
            Back to Emails
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {showThread ? (
          <EmailThread emails={threadEmails} currentEmailId={id} />
        ) : (
          <EmailDetail email={email} />
        )}
      </div>
    </div>
  );
}
