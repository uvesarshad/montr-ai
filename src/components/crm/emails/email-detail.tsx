'use client';

import { Email } from '@/hooks/crm/use-emails';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ActionMenu } from '@/components/ui-kit';
import { Star, Reply, Forward, Link as LinkIcon, Paperclip, ShieldBan } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface EmailDetailProps {
  email: Email;
}

export function EmailDetail({ email }: EmailDetailProps) {
  const senderInitials = email.from.name
    ? email.from.name.split(' ').map((n) => n[0]).join('').toUpperCase()
    : email.from.email[0].toUpperCase();

  const blockSender = async (pattern: string) => {
    try {
      const res = await fetch('/api/v2/crm/blocklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to block sender');
      }
      toast.success(`Blocked ${pattern}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to block sender');
    }
  };

  const senderDomain = email.from.email.split('@')[1];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold">{email.subject || '(No Subject)'}</h1>
          <div className="flex items-center gap-2">
            {email.isLinked && (
              <Badge variant="outline">
                <LinkIcon className="mr-1 size-3" />
                Linked
              </Badge>
            )}
            {email.hasAttachments && (
              <Badge variant="outline">
                <Paperclip className="mr-1 size-3" />
                {email.attachments.length} attachment{email.attachments.length > 1 ? 's' : ''}
              </Badge>
            )}
            <Badge variant={email.direction === 'inbound' ? 'default' : 'secondary'}>
              {email.direction === 'inbound' ? 'Received' : 'Sent'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Reply className="mr-2 size-4" />
            Reply
          </Button>
          <Button variant="outline" size="sm">
            <Forward className="mr-2 size-4" />
            Forward
          </Button>
          <Button variant="outline" size="sm">
            <Star className={email.isStarred ? 'fill-yellow-400 text-yellow-400' : ''} />
          </Button>
          <ActionMenu
            items={[
              {
                label: `Block ${email.from.email}`,
                icon: ShieldBan,
                onSelect: () => blockSender(email.from.email),
              },
              ...(senderDomain
                ? [
                    {
                      label: `Block domain @${senderDomain}`,
                      icon: ShieldBan,
                      onSelect: () => blockSender(`@${senderDomain}`),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {/* From/To */}
      <div className="mb-6 rounded-lg border p-4">
        <div className="mb-4 flex items-start gap-3">
          <Avatar>
            <AvatarFallback>{senderInitials}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  {email.from.name || email.from.email}
                </div>
                <div className="text-sm text-muted-foreground">
                  {email.from.email}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {format(new Date(email.date), 'PPp')}
              </div>
            </div>
          </div>
        </div>

        {/* To */}
        {email.to.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">To:</span>{' '}
            <span className="text-muted-foreground">
              {email.to.map((r) => r.name || r.email).join(', ')}
            </span>
          </div>
        )}

        {/* Cc */}
        {email.cc.length > 0 && (
          <div className="text-sm">
            <span className="font-medium">Cc:</span>{' '}
            <span className="text-muted-foreground">
              {email.cc.map((r) => r.name || r.email).join(', ')}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="prose prose-sm max-w-none">
        {email.bodyHtml ? (
          // Inbound email HTML is attacker-controlled. Render it inside a
          // sandboxed iframe with no allow-scripts / allow-same-origin so any
          // <script>, inline event handler, or same-origin access is inert.
          <iframe
            title="Email content"
            sandbox=""
            srcDoc={email.bodyHtml}
            className="h-[60vh] w-full rounded-lg border bg-white"
          />
        ) : (
          <div className="whitespace-pre-wrap">{email.bodyText}</div>
        )}
      </div>

      {/* Attachments */}
      {email.hasAttachments && email.attachments.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 font-semibold">Attachments</div>
          <div className="space-y-2">
            {email.attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Paperclip className="size-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">{attachment.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {(attachment.size / 1024).toFixed(2)} KB
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Download
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
