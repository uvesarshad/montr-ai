/**
 * CRM TypeScript Types
 *
 * This file contains all TypeScript type definitions for the CRM system.
 * Types are inferred from Zod schemas for consistency.
 */

// Re-export all validation schema types
export * from '@/validations/crm/contact.schema';
export * from '@/validations/crm/company.schema';
export * from '@/validations/crm/deal.schema';
export * from '@/validations/crm/pipeline.schema';
export * from '@/validations/crm/activity.schema';
export * from '@/validations/crm/tag.schema';
export * from '@/validations/crm/view.schema';
export * from '@/validations/crm/favorite.schema';
export * from '@/validations/crm/comment.schema';
export * from '@/validations/crm/attachment.schema';
export * from '@/validations/crm/custom-field.schema';
export * from '@/validations/crm/import.schema';
export * from '@/validations/crm/workflow.schema';
export * from '@/validations/crm/webhook.schema';
export * from '@/validations/crm/email-account.schema';
export * from '@/validations/crm/email.schema';
export * from '@/validations/crm/calendar-account.schema';
export * from '@/validations/crm/calendar-event.schema';
export * from '@/validations/crm/audit-log.schema';

// Additional CRM-specific types

/**
 * Contact types
 */
export type ContactStatus = 'lead' | 'prospect' | 'customer' | 'churned' | 'inactive';
export type ContactLifecycle = 'subscriber' | 'lead' | 'mql' | 'sql' | 'opportunity' | 'customer' | 'evangelist';
export type ContactRating = 'hot' | 'warm' | 'cold';
export type ContactSource = 'manual' | 'import' | 'form' | 'whatsapp' | 'website' | 'referral' | 'email' | 'api';
export type ContactChannelType = 'email' | 'phone' | 'whatsapp' | 'instagram' | 'facebook' | 'twitter' | 'linkedin';

export interface Contact {
  _id: string;
  companyId?: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  emails?: ContactEmail[];
  phones?: ContactPhone[];
  avatar?: string;
  jobTitle?: string;
  department?: string;
  channels: ContactChannel[];
  address?: Address;
  source: ContactSource;
  sourceDetails?: Record<string, unknown>;
  status: ContactStatus;
  lifecycle: ContactLifecycle;
  rating: ContactRating;
  score: number;
  tags: string[];
  customFields: Record<string, unknown>;
  ownerId?: string;
  assignedAt?: Date;
  lastActivityAt?: Date;
  lastContactedAt?: Date;
  lastEmailAt?: Date;
  lastCalendarEventAt?: Date;
  totalActivities: number;
  totalEmails: number;
  socialProfiles?: SocialProfiles;
  marketingConsent: boolean;
  consentTimestamp?: Date;
  doNotContact: boolean;
  notes?: RichNotes;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactEmail {
  value: string;
  label: 'work' | 'personal' | 'other';
  primary: boolean;
}

export interface ContactPhone {
  value: string;
  normalized?: string;
  label: 'work' | 'mobile' | 'home' | 'other';
  primary: boolean;
}

export interface ContactChannel {
  type: ContactChannelType;
  identifier: string;
  isPrimary: boolean;
  verified: boolean;
  lastContactedAt?: Date;
}

/**
 * Company types
 */
export type CompanyType = 'prospect' | 'customer' | 'partner' | 'vendor' | 'competitor';
export type CompanySize = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+';

export interface Company {
  _id: string;
  name: string;
  domain?: string;
  website?: string;
  logo?: string;
  description?: string;
  industry?: string;
  type: CompanyType;
  size?: CompanySize;
  annualRevenue?: number;
  employeeCount?: number;
  address?: Address;
  phone?: string;
  email?: string;
  socialProfiles?: SocialProfiles;
  tags: string[];
  customFields: Record<string, unknown>;
  ownerId?: string;
  assignedAt?: Date;
  contactCount: number;
  dealCount: number;
  totalDealValue: number;
  wonDealValue: number;
  lastActivityAt?: Date;
  totalActivities: number;
  notes?: RichNotes;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Deal types
 */
export type DealStatus = 'open' | 'won' | 'lost' | 'abandoned';
export type DealPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Deal {
  _id: string;
  contactId?: string;
  companyId?: string;
  pipelineId: string;
  stageId: string;
  name: string;
  description?: string;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate?: Date;
  actualCloseDate?: Date;
  status: DealStatus;
  lostReason?: string;
  wonReason?: string;
  ownerId?: string;
  assignedAt?: Date;
  tags: string[];
  customFields: Record<string, unknown>;
  priority: DealPriority;
  source?: string;
  lastActivityAt?: Date;
  nextActivityAt?: Date;
  totalActivities: number;
  stageHistory: DealStageHistory[];
  notes?: RichNotes;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealStageHistory {
  stageId: string;
  stageName: string;
  enteredAt: Date;
  exitedAt?: Date;
  duration?: number;
}

/**
 * Pipeline types
 */
export type PipelineStageType = 'open' | 'won' | 'lost';

export interface Pipeline {
  _id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  stages: PipelineStage[];
  currency: string;
  dealRotting: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStage {
  _id: string;
  name: string;
  order: number;
  probability: number;
  color: string;
  type: PipelineStageType;
  rottenDays?: number;
}

/**
 * Common types
 */
export interface Address {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface SocialProfiles {
  linkedin?: string;
  twitter?: string;
  facebook?: string;
  instagram?: string;
}

export interface RichNotes {
  content?: string; // TipTap JSON
  plainText?: string;
  updatedAt?: Date;
  updatedById?: string;
}

/**
 * Tag types
 */
export type TagType = 'contact' | 'company' | 'deal' | 'all';

export interface Tag {
  _id: string;
  name: string;
  color: string;
  description?: string;
  type: TagType;
  usageCount: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Activity types
 */
export type ActivityType =
  | 'note'
  | 'task'
  | 'call'
  | 'meeting'
  | 'email'
  | 'email_sent'
  | 'message'
  | 'calendar_event'
  | 'deal_created'
  | 'deal_stage_changed'
  | 'deal_won'
  | 'deal_lost'
  | 'contact_created'
  | 'form_submission'
  | 'workflow_triggered';

export type ActivityStatus = 'pending' | 'completed' | 'cancelled';
export type ActivityTargetType = 'contact' | 'company' | 'deal';

export interface Attendee {
  email: string;
  name?: string;
  status: 'pending' | 'accepted' | 'declined';
}

export interface EmailMetadata {
  messageId?: string;
  threadId?: string;
  accountId?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  hasAttachments?: boolean;
}

export interface MessageMetadata {
  channel?: 'whatsapp' | 'instagram' | 'facebook' | 'twitter' | 'sms';
  externalId?: string;
  direction?: 'inbound' | 'outbound';
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  campaignId?: string;
}

export interface CalendarMetadata {
  eventId?: string;
  accountId?: string;
  location?: string;
  meetingUrl?: string;
  attendees?: Attendee[];
}

export interface Activity {
  _id: string;
  type: ActivityType;
  targetType: ActivityTargetType;
  targetId: string;
  title: string;
  description?: string;
  body?: string;
  bodyPlain?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  status: ActivityStatus;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: Date;
  dueTime?: string;
  startDate?: Date;
  endDate?: Date;
  duration?: number;
  completedAt?: Date;
  completedById?: string;
  emailMetadata?: EmailMetadata;
  messageMetadata?: MessageMetadata;
  calendarMetadata?: CalendarMetadata;
  metadata?: Record<string, unknown>;
  ownerId?: string;
  assignedTo?: string;
  assignedAt?: Date;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Custom Field types
 */
export type CustomFieldEntityType = 'contact' | 'company' | 'deal';
export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone'
  | 'user'
  | 'contact'
  | 'company';

export interface CustomFieldOption {
  value: string;
  label: string;
  color?: string;
}

export interface CustomField {
  _id: string;
  entityType: CustomFieldEntityType;
  fieldKey: string;
  fieldLabel: string;
  fieldType: CustomFieldType;
  options?: CustomFieldOption[];
  required: boolean;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  regex?: string;
  order: number;
  showInList: boolean;
  showInCreate: boolean;
  showInFilters: boolean;
  width?: string;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Pagination types
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * API Response types
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

/**
 * View types
 */
export type ViewEntityType = 'contact' | 'company' | 'deal' | 'activity';
export type ViewVisibility = 'private' | 'team' | 'organization';

export interface View {
  _id: string;
  name: string;
  entityType: ViewEntityType;
  icon?: string;
  color?: string;
  filters: ViewFilter[];
  sort?: ViewSort;
  columns: string[];
  columnWidths: Record<string, number>;
  groupBy?: string;
  visibility: ViewVisibility;
  ownerId: string;
  sharedWith: string[];
  order: number;
  isPinned: boolean;
  isDefault: boolean;
  openRecordIn?: 'panel' | 'page';
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViewFilter {
  field: string;
  operator: string;
  value: unknown;
  conjunction: 'and' | 'or';
}

export interface ViewSort {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Favorite types
 */
export type FavoriteTargetType = 'contact' | 'company' | 'deal' | 'view';

export interface Favorite {
  _id: string;
  userId: string;
  targetType: FavoriteTargetType;
  targetId: string;
  folderId?: string;
  order: number;
  createdAt: Date;
}

/**
 * Comment types
 */
export type CommentTargetType = 'contact' | 'company' | 'deal' | 'activity';

export interface Comment {
  _id: string;
  targetType: CommentTargetType;
  targetId: string;
  body: string; // TipTap JSON
  bodyPlain: string;
  mentions: string[];
  parentId?: string;
  replyCount: number;
  reactions: CommentReaction[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
  createdById: string;
  author?: CommentAuthor;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentAuthor {
  id: string;
  name: string;
  image?: string;
}

export interface CommentReaction {
  emoji: string;
  userIds: string[];
}

/**
 * Attachment types
 */
export type AttachmentTargetType = 'contact' | 'company' | 'deal' | 'activity' | 'comment' | 'email';
export type AttachmentScanStatus = 'pending' | 'clean' | 'infected' | 'error';

export interface Attachment {
  _id: string;
  targetType: AttachmentTargetType;
  targetId: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  extension?: string;
  description?: string;
  isPublic: boolean;
  thumbnailUrl?: string;
  thumbnailKey?: string;
  scanStatus: AttachmentScanStatus;
  scannedAt?: Date;
  createdById: string;
  createdAt: Date;
}

/**
 * Import/Export types
 */
export type ImportEntityType = 'contact' | 'company';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type DuplicateHandling = 'skip' | 'update' | 'create';

export interface Import {
  _id: string;
  entityType: ImportEntityType;
  status: ImportStatus;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fieldMapping: Record<string, string>;
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  duplicateCount: number;
  errors: ImportError[];
  duplicateHandling: DuplicateHandling;
  duplicateField: string;
  defaultOwnerId?: string;
  defaultTags: string[];
  createCompanies: boolean;
  startedAt?: Date;
  completedAt?: Date;
  createdById: string;
  createdAt: Date;
}

export interface ImportError {
  row: number;
  error: string;
  data?: Record<string, unknown>;
}

/**
 * Stats and Analytics types
 */
export interface CrmStats {
  contactsTotal: number;
  contactsThisMonth: number;
  companiesTotal: number;
  companiesThisMonth: number;
  dealsTotal: number;
  dealsValue: number;
  dealsWonThisMonth: number;
  dealsWonValueThisMonth: number;
  activitiesThisWeek: number;
  tasksOverdue: number;
}

export interface DealFunnelStats {
  pipelineId: string;
  pipelineName: string;
  stages: {
    stageId: string;
    stageName: string;
    dealCount: number;
    totalValue: number;
    avgDealValue: number;
    avgTimeInStage: number;
    conversionRate?: number;
  }[];
}

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  userAvatar?: string;
  dealsWon: number;
  dealValue: number;
  activitiesCompleted: number;
  winRate: number;
  rank: number;
}
