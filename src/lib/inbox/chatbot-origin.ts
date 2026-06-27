export function normalizeChatbotHost(value?: string | null): string {
  if (!value) {
    return '';
  }

  try {
    const url = value.includes('://') ? new URL(value) : new URL(`https://${value}`);
    return url.host.toLowerCase();
  } catch {
    return value
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
  }
}

export function isAuthorizedChatbotOrigin(params: {
  websiteUrl?: string | null;
  websiteUrls?: string[] | null;
  origin?: string | null;
  referer?: string | null;
}): boolean {
  const urls: string[] = [
    ...(params.websiteUrls ?? []),
    ...(params.websiteUrl ? [params.websiteUrl] : []),
  ];

  const allowedHosts = [...new Set(urls.map(normalizeChatbotHost).filter(Boolean))];
  if (!allowedHosts.length) {
    return true;
  }

  const requestHost = normalizeChatbotHost(params.origin || params.referer);
  if (!requestHost) {
    return true;
  }

  return allowedHosts.includes(requestHost);
}

export function buildChatbotCorsHeaders(origin?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}
