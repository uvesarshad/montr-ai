import { ICrmCalendarAccount } from '@/lib/db/models/crm/calendar-account.model';
import { syncGoogleCalendar } from './google-calendar';
import { syncOutlookCalendar } from './outlook-calendar';

/**
 * Sync events from a calendar account
 */
export async function syncCalendarAccount(account: ICrmCalendarAccount): Promise<void> {
  try {
    switch (account.provider) {
      case 'google':
        await syncGoogleCalendar(account);
        break;
      case 'outlook':
        await syncOutlookCalendar(account);
        break;
      default:
        throw new Error(`Unsupported calendar provider: ${account.provider}`);
    }
  } catch (error) {
    console.error(`Error syncing ${account.provider} calendar:`, error);
    throw error;
  }
}

/**
 * Refresh OAuth token if expired
 */
export async function refreshCalendarOAuthToken(account: ICrmCalendarAccount): Promise<{
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
    case 'google':
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
    refreshToken: data.refresh_token || refreshToken,
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
      scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
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
