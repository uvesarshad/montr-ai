import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { findDuplicatesForCandidate } from '@/lib/crm/dedupe';
import { emitContactCreated } from '@/lib/crm';

/**
 * Free / consumer email providers — domains we never derive a company from.
 * Kept here as the single source of truth for the email-sync auto-create flow.
 */
export const FREE_EMAIL_PROVIDERS: ReadonlySet<string> = new Set([
  'gmail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'live.com',
  'msn.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'zoho.com',
]);

function isFreeProvider(domain: string): boolean {
  const d = domain.toLowerCase();
  if (FREE_EMAIL_PROVIDERS.has(d)) return true;
  // Cover wildcarded TLDs for yahoo/hotmail/gmx/yandex (e.g. yahoo.fr, gmx.de).
  return /^(yahoo|hotmail|gmx|yandex)\./.test(d);
}

// Senders we never auto-create from: automated / role / system addresses.
const NOISE_LOCALPART_RE =
  /^(?:noreply|no-reply|no_reply|notifications?|mailer-daemon|postmaster|donotreply|do-not-reply|bounce|bounces)\b/i;

export interface ParsedSender {
  email: string;
  name?: string;
}

/** Split a display name into first/last; fall back to the email local-part. */
function deriveNames(sender: ParsedSender): { firstName: string; lastName?: string } {
  const name = (sender.name || '').trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length === 1) return { firstName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  }
  const localPart = sender.email.split('@')[0] || sender.email;
  return { firstName: localPart };
}

/** Title-case a domain into a company name, dropping the TLD. */
function companyNameFromDomain(domain: string): string {
  const base = domain.split('.')[0] || domain;
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Collect the account's own addresses (primary email + IMAP/SMTP usernames). */
function accountOwnAddresses(account: ICrmEmailAccount): Set<string> {
  const set = new Set<string>();
  if (account.email) set.add(account.email.toLowerCase());
  const imapUser = account.imap?.username;
  if (imapUser && imapUser.includes('@')) set.add(imapUser.toLowerCase());
  const smtpUser = account.smtp?.username;
  if (smtpUser && smtpUser.includes('@')) set.add(smtpUser.toLowerCase());
  return set;
}

/**
 * Resolve a contact for an inbound message's sender, creating one (and
 * optionally a company) when `account.autoCreateContacts` is enabled.
 *
 * Returns the contact id to link, or null when no contact could/should be
 * resolved (sender is the account itself, a noise address, or a duplicate
 * check / creation failed). Never throws — auto-create must never fail a sync.
 *
 * Callers should only invoke this for INBOUND messages, and only after a
 * blocklist check has passed (blocked senders skip linking AND auto-create).
 */
export async function resolveOrCreateContactForSender(
  account: ICrmEmailAccount,
  sender: ParsedSender | undefined,
): Promise<string | null> {
  try {
    const email = sender?.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) return null;
    // 1. Existing contact wins — just link.
    const existing = await contactRepository.findByEmail(email);
    if (existing) return existing._id.toString();

    // From here on we only proceed when auto-create is enabled.
    if (!account.autoCreateContacts) return null;

    // Noise guards: skip role/automated senders and the account's own address.
    const localPart = email.split('@')[0] || '';
    if (NOISE_LOCALPART_RE.test(localPart)) return null;

    const domain = email.split('@')[1] || '';
    const ownAddresses = accountOwnAddresses(account);
    if (ownAddresses.has(email)) return null;
    // Skip the account's own domain (e.g. internal/self mail).
    const accountDomain = (account.email.split('@')[1] || '').toLowerCase();
    if (domain && accountDomain && domain === accountDomain) return null;

    const { firstName, lastName } = deriveNames({ email, name: sender?.name });

    // Respect dedupe rules — link to a matched record instead of creating.
    const duplicates = await findDuplicatesForCandidate('contact', {
      email,
      firstName,
      lastName,
    });
    if (duplicates.length > 0) {
      const match = duplicates[0]?.records?.[0];
      const matchId = match?._id;
      if (matchId) return String(matchId);
    }

    // Optionally resolve/create a company from a non-free sender domain.
    let companyId: string | undefined;
    if (account.autoCreateCompanies && domain && !isFreeProvider(domain)) {
      try {
        const existingCompany = await companyRepository.findByDomain(domain);
        if (existingCompany) {
          companyId = existingCompany._id.toString();
        } else {
          const company = await companyRepository.create({
            name: companyNameFromDomain(domain),
            domain,
            createdById: account.userId.toString(),
          });
          companyId = company._id.toString();
        }
      } catch (companyError) {
        console.error('[Email Sync] Auto-create company failed:', companyError);
      }
    }

    const contact = await contactRepository.create({
      firstName,
      lastName,
      email,
      companyId,
      source: 'email',
      createdById: account.userId.toString(),
    });

    try {
      await emitContactCreated(contact, account.userId.toString());
    } catch (emitError) {
      console.error('[Email Sync] emitContactCreated failed:', emitError);
    }

    return contact._id.toString();
  } catch (error) {
    console.error('[Email Sync] resolveOrCreateContactForSender failed:', error);
    return null;
  }
}
