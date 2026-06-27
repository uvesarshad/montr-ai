'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpRight, Mail, Paperclip, Star } from 'lucide-react';

import { useEmails } from '@/hooks/crm/use-emails';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { buildContactEmailThreads } from './contact-email-threads';

interface ContactEmailsTabProps {
  contactId: string;
}

export function ContactEmailsTab({ contactId }: ContactEmailsTabProps) {
  const {
    emails,
    loading,
    error,
    refetch,
  } = useEmails(
    { contactId },
    { page: 1, limit: 25, sort: 'date', sortDirection: 'desc' }
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((item) => (
          <Card key={item} className="space-y-3 p-4">
            <Skeleton className="size-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col gap-3 p-6 text-center">
        <div className="space-y-1">
          <h3 className="font-medium">Failed to load contact emails</h3>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  const threads = buildContactEmailThreads(emails);

  if (threads.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Mail className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h3 className="font-medium">No linked emails yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Synced contact emails will appear here as conversation threads.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/60 p-4">
        <div>
          <h3 className="font-medium">Linked conversations</h3>
          <p className="text-sm text-muted-foreground">
            {threads.length} thread{threads.length === 1 ? '' : 's'} across {emails.length}{' '}
            email{emails.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link href="/crm/emails">
          <Button variant="outline" size="sm">
            Open Inbox
            <ArrowUpRight className="ml-2 size-4" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {threads.map((thread) => (
          <Link key={thread.threadId} href={`/crm/emails/${thread.latestEmailId}`} className="block">
            <Card className="space-y-3 border-border/60 p-4 transition-colors hover:border-primary/40 hover:bg-accent/30">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate font-medium">{thread.subject}</h4>
                    {thread.isStarred && <Star className="size-4 fill-yellow-400 text-yellow-400" />}
                    {thread.hasAttachments && <Paperclip className="size-4 text-muted-foreground" />}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Latest with {thread.counterpartLabel}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(thread.latestDate, { addSuffix: true })}
                </span>
              </div>

              <p className="line-clamp-2 text-sm text-muted-foreground">
                {thread.snippet || 'Open the latest message to view the full conversation.'}
              </p>

              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {thread.messageCount} message{thread.messageCount === 1 ? '' : 's'}
                </Badge>
                {thread.unreadCount > 0 && (
                  <Badge variant="outline">
                    {thread.unreadCount} unread
                  </Badge>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
