import crypto from 'crypto';

export function verifyWhatsAppSignature(rawBody: string, signature: string | null): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return process.env.NODE_ENV !== 'production';
  }

  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  return signature === `sha256=${expected}`;
}

export function parseWebhookBody(rawBody: string): Record<string, unknown> {
  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    throw new Error('Invalid JSON payload');
  }
}
