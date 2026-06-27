'use client';

import { useReducer, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Mail, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface EmailAccountConnectProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface ImapFormState {
  email: string;
  displayName: string;
  imapHost: string;
  imapPort: string;
  imapSecure: boolean;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: boolean;
  smtpUsername: string;
  smtpPassword: string;
}

const initialImapForm: ImapFormState = {
  email: '',
  displayName: '',
  imapHost: '',
  imapPort: '993',
  imapSecure: true,
  imapUsername: '',
  imapPassword: '',
  smtpHost: '',
  smtpPort: '465',
  smtpSecure: true,
  smtpUsername: '',
  smtpPassword: '',
};

type ImapFormAction =
  | { type: 'set'; field: keyof ImapFormState; value: string | boolean }
  | { type: 'reset' };

function imapFormReducer(state: ImapFormState, action: ImapFormAction): ImapFormState {
  switch (action.type) {
    case 'set':
      return { ...state, [action.field]: action.value };
    case 'reset':
      return initialImapForm;
    default:
      return state;
  }
}

function ImapSmtpForm({
  form,
  dispatch,
}: {
  form: ImapFormState;
  dispatch: React.Dispatch<ImapFormAction>;
}) {
  const {
    email,
    displayName,
    imapHost,
    imapPort,
    imapSecure,
    imapUsername,
    imapPassword,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUsername,
    smtpPassword,
  } = form;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email Address *</Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => dispatch({ type: 'set', field: 'email', value: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          placeholder="Your Name"
          value={displayName}
          onChange={(e) => dispatch({ type: 'set', field: 'displayName', value: e.target.value })}
        />
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">IMAP Settings (Incoming Mail)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="imapHost">IMAP Host *</Label>
            <Input
              id="imapHost"
              placeholder="imap.example.com"
              value={imapHost}
              onChange={(e) => dispatch({ type: 'set', field: 'imapHost', value: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imapPort">Port *</Label>
            <Input
              id="imapPort"
              type="number"
              placeholder="993"
              value={imapPort}
              onChange={(e) => dispatch({ type: 'set', field: 'imapPort', value: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imapSecure">Use SSL/TLS</Label>
            <div className="flex items-center h-10">
              <Switch
                id="imapSecure"
                checked={imapSecure}
                onCheckedChange={(checked) => dispatch({ type: 'set', field: 'imapSecure', value: checked })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imapUsername">Username *</Label>
            <Input
              id="imapUsername"
              placeholder="username"
              value={imapUsername}
              onChange={(e) => dispatch({ type: 'set', field: 'imapUsername', value: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imapPassword">Password *</Label>
            <Input
              id="imapPassword"
              type="password"
              placeholder="••••••••"
              value={imapPassword}
              onChange={(e) => dispatch({ type: 'set', field: 'imapPassword', value: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">SMTP Settings (Outgoing Mail)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="smtpHost">SMTP Host *</Label>
            <Input
              id="smtpHost"
              placeholder="smtp.example.com"
              value={smtpHost}
              onChange={(e) => dispatch({ type: 'set', field: 'smtpHost', value: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpPort">Port *</Label>
            <Input
              id="smtpPort"
              type="number"
              placeholder="465"
              value={smtpPort}
              onChange={(e) => dispatch({ type: 'set', field: 'smtpPort', value: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpSecure">Use SSL/TLS</Label>
            <div className="flex items-center h-10">
              <Switch
                id="smtpSecure"
                checked={smtpSecure}
                onCheckedChange={(checked) => dispatch({ type: 'set', field: 'smtpSecure', value: checked })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpUsername">Username *</Label>
            <Input
              id="smtpUsername"
              placeholder="username"
              value={smtpUsername}
              onChange={(e) => dispatch({ type: 'set', field: 'smtpUsername', value: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtpPassword">Password *</Label>
            <Input
              id="smtpPassword"
              type="password"
              placeholder="••••••••"
              value={smtpPassword}
              onChange={(e) => dispatch({ type: 'set', field: 'smtpPassword', value: e.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmailAccountConnect({
  open,
  onOpenChange,
  onSuccess,
}: EmailAccountConnectProps) {
  const [provider, setProvider] = useState<'gmail' | 'outlook' | 'imap'>('gmail');
  const [connecting, setConnecting] = useState(false);

  // IMAP/SMTP form state
  const [form, dispatch] = useReducer(imapFormReducer, initialImapForm);
  const {
    email,
    displayName,
    imapHost,
    imapPort,
    imapSecure,
    imapUsername,
    imapPassword,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUsername,
    smtpPassword,
  } = form;

  const handleOAuthConnect = (provider: 'gmail' | 'outlook') => {
    // Store return URL in localStorage
    localStorage.setItem('oauth_return_url', window.location.pathname);

    // Redirect to OAuth flow (no brandId needed for CRM)
    const oauthUrl = `/api/social/oauth/${provider}?source=crm`;
    window.location.href = oauthUrl;
  };

  const handleImapConnect = async () => {
    if (!email || !imapHost || !imapUsername || !imapPassword || !smtpHost || !smtpUsername || !smtpPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    setConnecting(true);

    try {
      const response = await fetch('/api/v2/crm/email-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          displayName: displayName || undefined,
          provider: 'imap',
          imap: {
            host: imapHost,
            port: parseInt(imapPort),
            secure: imapSecure,
            username: imapUsername,
            password: imapPassword,
          },
          smtp: {
            host: smtpHost,
            port: parseInt(smtpPort),
            secure: smtpSecure,
            username: smtpUsername,
            password: smtpPassword,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to connect email account');
      }

      toast.success('Email account connected successfully');
      onOpenChange(false);
      onSuccess?.();

      // Reset form
      dispatch({ type: 'reset' });
    } catch (error) {
      console.error('Error connecting email account:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to connect email account');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect Email Account</DialogTitle>
          <DialogDescription>
            Connect your email account to send and receive emails from the CRM
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Provider selection */}
          <div className="space-y-2">
            <Label>Email Provider</Label>
            <Select value={provider} onValueChange={(value: string) => setProvider(value as 'gmail' | 'outlook' | 'imap')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gmail">Gmail (Google Workspace)</SelectItem>
                <SelectItem value="outlook">Outlook (Microsoft 365)</SelectItem>
                <SelectItem value="imap">Other (IMAP/SMTP)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* OAuth providers */}
          {(provider === 'gmail' || provider === 'outlook') && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="size-5 text-blue-500 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">OAuth Authentication</p>
                    <p className="text-sm text-muted-foreground">
                      You&apos;ll be redirected to {provider === 'gmail' ? 'Google' : 'Microsoft'} to securely authorize access to your email account. We only request the minimum permissions needed for email functionality.
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleOAuthConnect(provider)}
                className="w-full"
                size="lg"
              >
                <Mail className="mr-2 size-5" />
                Connect with {provider === 'gmail' ? 'Google' : 'Microsoft'}
              </Button>
            </div>
          )}

          {/* IMAP/SMTP form */}
          {provider === 'imap' && <ImapSmtpForm form={form} dispatch={dispatch} />}
        </div>

        {provider === 'imap' && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={connecting}
            >
              Cancel
            </Button>
            <Button onClick={handleImapConnect} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect Account'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
