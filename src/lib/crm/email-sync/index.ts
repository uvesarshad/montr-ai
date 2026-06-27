import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';
import { syncGmailAccount } from './gmail';
import { syncOutlookAccount } from './outlook';
import { syncImapAccount } from './imap';
import { sendGmailEmail } from './gmail';
import { sendOutlookEmail } from './outlook';
import { sendImapEmail } from './imap';

export interface SendEmailOptions {
  to: { email: string; name?: string }[];
  cc?: { email: string; name?: string }[];
  bcc?: { email: string; name?: string }[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  replyTo?: string;
  inReplyTo?: string;
  attachments?: { fileName: string; content: Buffer; mimeType: string }[];
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  email?: unknown;
  error?: string;
}

/**
 * Sync emails from an email account
 */
export async function syncEmailAccount(account: ICrmEmailAccount): Promise<void> {
  try {
    switch (account.provider) {
      case 'gmail':
        await syncGmailAccount(account);
        break;
      case 'outlook':
        await syncOutlookAccount(account);
        break;
      case 'imap':
        await syncImapAccount(account);
        break;
      default:
        throw new Error(`Unsupported email provider: ${account.provider}`);
    }
  } catch (error) {
    console.error(`Error syncing ${account.provider} account:`, error);
    throw error;
  }
}

/**
 * Send email via email account
 */
export async function sendEmail(
  account: ICrmEmailAccount,
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    switch (account.provider) {
      case 'gmail':
        return await sendGmailEmail(account, options);
      case 'outlook':
        return await sendOutlookEmail(account, options);
      case 'imap':
        return await sendImapEmail(account, options);
      default:
        return {
          success: false,
          error: `Unsupported email provider: ${account.provider}`,
        };
    }
  } catch (error) {
    console.error(`Error sending email via ${account.provider}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Refresh OAuth token if expired
 */
export async function refreshOAuthToken(account: ICrmEmailAccount): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  if (!account.oauth) {
    throw new Error('No OAuth credentials found');
  }

  // Check if token is expired or about to expire (within 5 minutes)
  const now = new Date();
  const expiresAt = account.oauth.expiresAt ? new Date(account.oauth.expiresAt) : null;
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (expiresAt && expiresAt > fiveMinutesFromNow) {
    // Token is still valid
    return {
      accessToken: account.oauth.accessToken,
      refreshToken: account.oauth.refreshToken,
      expiresAt,
    };
  }

  // Refresh token based on provider
  switch (account.provider) {
    case 'gmail':
      return await refreshGoogleToken(account.oauth.refreshToken);
    case 'outlook':
      return await refreshMicrosoftToken(account.oauth.refreshToken);
    default:
      throw new Error(`OAuth refresh not supported for provider: ${account.provider}`);
  }
}

/**
 * Refresh Google OAuth token
 */
async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Google OAuth token');
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Google may not return new refresh token
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/**
 * Refresh Microsoft OAuth token
 */
async function refreshMicrosoftToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID || '',
      client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh Microsoft OAuth token');
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
