/**
 * Contact identity field normalization (Twenty-style multi-value emails/phones).
 *
 * A contact carries arrays of emails and phones, plus scalar `email` /
 * `phone` / `phoneNormalized` fields that mirror the PRIMARY entry for
 * full back-compat with every legacy caller and the org+email unique index.
 *
 * This helper is the single source of truth for keeping the arrays and the
 * scalar mirrors consistent. It is invoked from the repository create/update
 * and bulk paths (NOT model hooks — the contact model already uses hooks only
 * for the `phone` -> `phoneNormalized` scalar sync, which this helper supersedes
 * for array-aware writes while remaining compatible with scalar-only writes).
 *
 * Rules enforced:
 *  - Exactly one primary per array (first entry if none flagged).
 *  - Primary email value -> scalar `email` (lowercased).
 *  - Primary phone -> scalar `phone` + `phoneNormalized` (digits-only).
 *  - Legacy scalar-only writes (email/phone with no arrays) upsert the scalar
 *    into the array as the primary entry.
 */

import { normalizePhoneForMatch } from '@/lib/identity/normalize';

export type ContactEmailLabel = 'work' | 'personal' | 'other';
export type ContactPhoneLabel = 'work' | 'mobile' | 'home' | 'other';

export interface ContactEmailEntry {
  value: string;
  label: ContactEmailLabel;
  primary: boolean;
}

export interface ContactPhoneEntry {
  value: string;
  normalized?: string;
  label: ContactPhoneLabel;
  primary: boolean;
}

/** Shape of the slice of a contact this helper reads/writes. */
export interface ContactIdentityFields {
  email?: string | null;
  phone?: string | null;
  phoneNormalized?: string;
  emails?: Array<Partial<ContactEmailEntry> & { value: string }>;
  phones?: Array<Partial<ContactPhoneEntry> & { value: string }>;
}

function ensureOnePrimary<T extends { primary?: boolean }>(arr: T[]): T[] {
  if (arr.length === 0) return arr;
  const primaryIdx = arr.findIndex((e) => e.primary);
  const chosen = primaryIdx === -1 ? 0 : primaryIdx;
  arr.forEach((e, i) => {
    e.primary = i === chosen;
  });
  return arr;
}

/**
 * Normalize a contact's identity fields in place-ish: returns a new object
 * holding only the identity keys that should be written, with arrays + scalar
 * mirrors made consistent. Pass only the fields present on the write; absent
 * keys are left untouched so partial updates don't clobber existing data.
 *
 * @param data the (already validated) write payload slice
 * @returns the identity fields to merge into the create/update payload
 */
export function normalizeContactIdentityFields(
  data: ContactIdentityFields
): Partial<{
  email: string | undefined;
  phone: string | undefined;
  phoneNormalized: string | undefined;
  emails: ContactEmailEntry[];
  phones: ContactPhoneEntry[];
}> {
  const out: ReturnType<typeof normalizeContactIdentityFields> = {};

  const hasEmailsArray = Array.isArray(data.emails);
  const hasPhonesArray = Array.isArray(data.phones);
  const hasScalarEmail = 'email' in data;
  const hasScalarPhone = 'phone' in data;

  /* ---------------- Emails ---------------- */
  if (hasEmailsArray) {
    const emails: ContactEmailEntry[] = (data.emails || [])
      .map((e) => ({
        value: String(e.value || '').trim().toLowerCase(),
        label: (e.label as ContactEmailLabel) || 'work',
        primary: !!e.primary,
      }))
      .filter((e) => e.value.length > 0);
    ensureOnePrimary(emails);
    out.emails = emails;
    const primary = emails.find((e) => e.primary);
    out.email = primary?.value;
  } else if (hasScalarEmail) {
    // Legacy scalar-only write: upsert into the array as primary.
    const value = data.email ? String(data.email).trim().toLowerCase() : undefined;
    if (value) {
      out.email = value;
      out.emails = [{ value, label: 'work', primary: true }];
    } else {
      // Email explicitly cleared.
      out.email = undefined;
      out.emails = [];
    }
  }

  /* ---------------- Phones ---------------- */
  if (hasPhonesArray) {
    const phones: ContactPhoneEntry[] = (data.phones || [])
      .map((p) => {
        const value = String(p.value || '').trim();
        return {
          value,
          normalized: normalizePhoneForMatch(value) ?? undefined,
          label: (p.label as ContactPhoneLabel) || 'mobile',
          primary: !!p.primary,
        };
      })
      .filter((p) => p.value.length > 0);
    ensureOnePrimary(phones);
    out.phones = phones;
    const primary = phones.find((p) => p.primary);
    out.phone = primary?.value;
    out.phoneNormalized = primary?.normalized;
  } else if (hasScalarPhone) {
    const value = data.phone ? String(data.phone).trim() : undefined;
    if (value) {
      const normalized = normalizePhoneForMatch(value) ?? undefined;
      out.phone = value;
      out.phoneNormalized = normalized;
      out.phones = [{ value, normalized, label: 'mobile', primary: true }];
    } else {
      out.phone = undefined;
      out.phoneNormalized = undefined;
      out.phones = [];
    }
  }

  return out;
}
