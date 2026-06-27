'use client';

import { Email } from '@/hooks/crm/use-emails';
import { EmailDetail } from './email-detail';
import { cn } from '@/lib/utils';

interface EmailThreadProps {
  emails: Email[];
  currentEmailId: string;
}

export function EmailThread({ emails, currentEmailId }: EmailThreadProps) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Conversation ({emails.length} messages)</h2>
      </div>

      {emails.map((email, _index) => (
        <div
          key={email.id}
          className={cn(
            'rounded-lg border',
            email.id === currentEmailId && 'ring-2 ring-primary'
          )}
        >
          <div className="p-6">
            <EmailDetail email={email} />
          </div>
        </div>
      ))}
    </div>
  );
}
