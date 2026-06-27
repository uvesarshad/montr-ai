export {
  normalizeEmail,
  normalizeHandle,
  normalizePhoneForMatch,
  toE164Display,
  type SocialPlatform,
} from './normalize';

export {
  resolveContact,
  mergeContacts,
  type ResolveContactInput,
  type ResolveContactResult,
  type IdentityMatchedBy,
  type MergeContactsInput,
  type MergeContactsResult,
} from './resolver';

export {
  backfillWhatsAppConversations,
  backfillInboxConversations,
  backfillCrmEmails,
  type BackfillOptions,
  type BackfillReport,
} from './backfill';
