import { it, expect } from 'vitest';

import {
  getXOAuthAppUrl,
  getXOAuthCallbackUrl,
  getXOAuthResultUrl,
  getXOAuthScopes,
} from './x-oauth';

it('getXOAuthAppUrl prefers a dedicated X OAuth base URL over NEXT_PUBLIC_APP_URL', () => {
  const env = {
    X_OAUTH_APP_URL: 'https://app.montr.io/',
    NEXT_PUBLIC_APP_URL: 'http://localhost:9002',
  };

  expect(getXOAuthAppUrl(env, 'http://localhost:9002/api/social/oauth/x')).toBe('https://app.montr.io');
  expect(getXOAuthCallbackUrl(env, 'http://localhost:9002/api/social/oauth/x')).toBe('https://app.montr.io/api/social/oauth/x/callback');
  expect(getXOAuthResultUrl(env, 'http://localhost:9002/api/social/oauth/x')).toBe('https://app.montr.io/social/oauth-callback');
});

it('getXOAuthAppUrl falls back to the request origin when no env override is set', () => {
  expect(getXOAuthAppUrl({}, 'https://preview.montr.io/api/social/oauth/x')).toBe('https://preview.montr.io');
});

it('getXOAuthScopes excludes media.write by default', () => {
  expect(getXOAuthScopes({})).toEqual([
    'tweet.read',
    'tweet.write',
    'users.read',
    'offline.access',
  ]);
});

it('getXOAuthScopes includes media.write when explicitly enabled', () => {
  expect(getXOAuthScopes({ X_OAUTH_INCLUDE_MEDIA_WRITE: 'true' })).toEqual([
    'tweet.read',
    'tweet.write',
    'users.read',
    'offline.access',
    'media.write',
  ]);
});
