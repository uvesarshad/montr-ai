'use client';

import { useReducer, useState } from 'react';
import { useEmailAccounts } from '@/hooks/crm/use-email-accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { X, Send } from 'lucide-react';
import { toast } from 'sonner';

interface ComposerFormState {
  accountId: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
  showCc: boolean;
}

type ComposerFormAction =
  | { type: 'set'; field: keyof ComposerFormState; value: string | boolean }
  | { type: 'reset' };

function composerFormReducer(state: ComposerFormState, action: ComposerFormAction): ComposerFormState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'reset':
      return { accountId: '', to: '', cc: '', subject: '', body: '', showCc: false };
    default:
      return state;
  }
}

interface EmailComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  replyTo?: string;
  inReplyTo?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

export function EmailComposer({
  open,
  onOpenChange,
  defaultTo = '',
  defaultSubject = '',
  replyTo,
  inReplyTo,
  contactId,
  companyId,
  dealId,
}: EmailComposerProps) {
  const { accounts } = useEmailAccounts();
  const [form, dispatch] = useReducer(composerFormReducer, {
    accountId: '',
    to: defaultTo,
    cc: '',
    subject: defaultSubject,
    body: '',
    showCc: false,
  });
  const { accountId, to, cc, subject, body, showCc } = form;
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!accountId) {
      toast.error('Please select an email account');
      return;
    }

    if (!to) {
      toast.error('Please enter a recipient');
      return;
    }

    if (!body) {
      toast.error('Please enter a message');
      return;
    }

    setSending(true);

    try {
      const toAddresses = to.split(',').map((email) => ({
        email: email.trim(),
      }));

      const ccAddresses = cc
        ? cc.split(',').map((email) => ({ email: email.trim() }))
        : [];

      const response = await fetch('/api/v2/crm/emails/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId,
          to: toAddresses,
          cc: ccAddresses.length > 0 ? ccAddresses : undefined,
          subject: subject || undefined,
          bodyText: body,
          replyTo,
          inReplyTo,
          contactId,
          companyId,
          dealId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      toast.success('Email sent successfully');
      onOpenChange(false);

      // Reset form
      dispatch({ type: 'reset' });
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Email</DialogTitle>
          <DialogDescription>
            Compose and send a new email from your connected accounts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* From account */}
          <div className="space-y-2">
            <Label htmlFor="account">From</Label>
            <Select value={accountId} onValueChange={(value) => dispatch({ type: 'set', field: 'accountId', value })}>
              <SelectTrigger id="account">
                <SelectValue placeholder="Select email account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.displayName} ({account.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="to">To</Label>
              {!showCc && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => dispatch({ type: 'set', field: 'showCc', value: true })}
                  className="h-auto p-0 text-xs"
                >
                  Add Cc
                </Button>
              )}
            </div>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com (comma-separated for multiple)"
              value={to}
              onChange={(e) => dispatch({ type: 'set', field: 'to', value: e.target.value })}
            />
          </div>

          {/* Cc */}
          {showCc && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cc">Cc</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    dispatch({ type: 'set', field: 'showCc', value: false });
                    dispatch({ type: 'set', field: 'cc', value: '' });
                  }}
                  className="h-auto p-0"
                >
                  <X className="size-3" />
                </Button>
              </div>
              <Input
                id="cc"
                type="email"
                placeholder="recipient@example.com (comma-separated for multiple)"
                value={cc}
                onChange={(e) => dispatch({ type: 'set', field: 'cc', value: e.target.value })}
              />
            </div>
          )}

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => dispatch({ type: 'set', field: 'subject', value: e.target.value })}
            />
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              placeholder="Write your message..."
              value={body}
              onChange={(e) => dispatch({ type: 'set', field: 'body', value: e.target.value })}
              rows={10}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              'Sending...'
            ) : (
              <>
                <Send className="mr-2 size-4" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
