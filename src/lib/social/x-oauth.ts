export type OAuthEnv = Record<string, string | undefined>;

const DEFAULT_X_OAUTH_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
const X_MEDIA_WRITE_SCOPE = 'media.write';
const FALLBACK_APP_URL = 'http://localhost:9002';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function getXOAuthAppUrl(
  env: OAuthEnv = process.env,
  requestUrl?: string,
): string {
  const configuredUrl =
    env.X_OAUTH_APP_URL?.trim() ||
    env.NEXT_PUBLIC_APP_URL?.trim() ||
    (requestUrl ? new URL(requestUrl).origin : FALLBACK_APP_URL);

  return trimTrailingSlash(configuredUrl);
}

export function getXOAuthCallbackUrl(
  env: OAuthEnv = process.env,
  requestUrl?: string,
): string {
  return `${getXOAuthAppUrl(env, requestUrl)}/api/social/oauth/x/callback`;
}

export function getXOAuthResultUrl(
  env: OAuthEnv = process.env,
  requestUrl?: string,
): string {
  return `${getXOAuthAppUrl(env, requestUrl)}/social/oauth-callback`;
}

export function getXOAuthScopes(env: OAuthEnv = process.env): string[] {
  if (isTruthy(env.X_OAUTH_INCLUDE_MEDIA_WRITE)) {
    return [...DEFAULT_X_OAUTH_SCOPES, X_MEDIA_WRITE_SCOPE];
  }

  return [...DEFAULT_X_OAUTH_SCOPES];
}
