'use client';

import { Email } from '@/hooks/crm/use-emails';
import { EmailItem } from './email-item';

interface EmailListProps {
  emails: Email[];
  onMarkRead: (id: string) => Promise<void>;
  onMarkUnread: (id: string) => Promise<void>;
  onToggleStar: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EmailList({
  emails,
  onMarkRead,
  onMarkUnread,
  onToggleStar,
  onDelete,
}: EmailListProps) {
  return (
    <div className="divide-y">
      {emails.map((email) => (
        <EmailItem
          key={email.id}
          email={email}
          onMarkRead={onMarkRead}
          onMarkUnread={onMarkUnread}
          onToggleStar={onToggleStar}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
