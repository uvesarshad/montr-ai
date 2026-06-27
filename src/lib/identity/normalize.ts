/**
 * Identifier normalization for the identity resolver (X2).
 *
 * Goal: turn user-typed identifiers into a canonical form that survives
 * formatting differences ("+91 98765 43210" / "98765-43210" / "919876543210"
 * all match the same contact).
 *
 * We deliberately do NOT pull libphonenumber-js here — adding ~200KB to the
 * worker bundle for two functions isn't worth it. If country-aware parsing
 * becomes a real need, swap `normalizePhoneForMatch` for a libphonenumber
 * impl and keep the same interface.
 */

export type SocialPlatform = 'whatsapp' | 'instagram' | 'facebook' | 'twitter' | 'linkedin' | 'telegram';

/**
 * Canonical form for phone lookups: digits only, no `+`, no spaces, no dashes.
 * Returns null when the input has too few digits to be a real phone number.
 *
 * "+91 98765 43210"  -> "919876543210"
 * "(415) 555-1234"   -> "4155551234"
 * "abc"              -> null
 * "12"               -> null
 */
export function normalizePhoneForMatch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7) return null; // shortest valid international number is ~7 digits
  return digits;
}

/**
 * E.164-ish formatter for display. Prepends `+` if missing and the number
 * looks long enough to be international. Returns null on garbage input.
 *
 * Note: this does NOT validate country codes. Use only for display/storage,
 * not for routing decisions.
 */
export function toE164Display(raw: string | null | undefined): string | null {
  const digits = normalizePhoneForMatch(raw);
  if (!digits) return null;
  return `+${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim().toLowerCase();
  if (!trimmed.includes('@')) return null;
  return trimmed;
}

/**
 * Per-platform handle normalization. Strips leading `@`, trims whitespace,
 * lowercases for case-insensitive platforms.
 *
 * Twitter/Instagram/TikTok: case-insensitive, no `@` prefix in canonical form
 * LinkedIn: case-sensitive slug
 * Telegram: case-insensitive
 * Facebook: case-insensitive vanity URL
 * WhatsApp: stored as phone — use `normalizePhoneForMatch` instead
 */
export function normalizeHandle(platform: SocialPlatform, raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = String(raw).trim();
  if (h.startsWith('@')) h = h.slice(1);
  if (!h) return null;

  switch (platform) {
    case 'linkedin':
      return h; // preserve case
    case 'whatsapp':
      // WhatsApp identifies by phone number — caller should use normalizePhoneForMatch
      return normalizePhoneForMatch(h);
    case 'instagram':
    case 'facebook':
    case 'twitter':
    case 'telegram':
      return h.toLowerCase();
    default:
      return h.toLowerCase();
  }
}
