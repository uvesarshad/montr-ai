// CRM Models - Index File
// Export all CRM models for easy importing

// Core CRM Models
export { default as CrmContact } from './contact.model';
export type { ICrmContact, IContactChannel, IAddress, ISocialProfiles, IRichNotes, ISourceDetails } from './contact.model';

export { default as CrmCompany } from './company.model';
export type { ICrmCompany, ICompanyAddress, ICompanySocialProfiles, ICompanyRichNotes } from './company.model';

export { default as CrmDeal } from './deal.model';
export type { ICrmDeal, IDealStageHistory, IDealRichNotes } from './deal.model';

export { default as CrmPipeline } from './pipeline.model';
export type { ICrmPipeline, IPipelineStage } from './pipeline.model';

export { default as CrmActivity } from './activity.model';
export type {
  ICrmActivity,
  ActivityType,
  IAttendee,
  IEmailMetadata,
  IMessageMetadata,
  ICalendarMetadata
} from './activity.model';

export { default as CrmTag } from './tag.model';
export type { ICrmTag } from './tag.model';

export { default as CrmCustomField } from './custom-field.model';
export type { ICrmCustomField, CustomFieldType, ICustomFieldOption } from './custom-field.model';

export { default as CrmImport } from './import.model';
export type { ICrmImport, IImportError } from './import.model';

export { default as CrmDedupeRule } from './dedupe-rule.model';
export type { ICrmDedupeRule, IDedupeCriterion } from './dedupe-rule.model';

// Feature Models
export { default as CrmView } from './view.model';
export type { ICrmView, IViewFilter, IViewSort, FilterOperator } from './view.model';

export { default as CrmFavorite } from './favorite.model';
export type { ICrmFavorite } from './favorite.model';

export { default as CrmComment } from './comment.model';
export type { ICrmComment, ICommentReaction } from './comment.model';

export { default as CrmAttachment } from './attachment.model';
export type { ICrmAttachment } from './attachment.model';

// Automation Models
export { default as CrmWorkflow } from './workflow.model';
export type {
  ICrmWorkflow,
  WorkflowTriggerType,
  WorkflowActionType,
  IWorkflowTrigger,
  IWorkflowTriggerConfig,
  IWorkflowCondition,
  IWorkflowAction,
  IWorkflowActionConfig
} from './workflow.model';

export { default as CrmWebhook, CrmWebhookLog } from './webhook.model';
export type { ICrmWebhook, ICrmWebhookLog, WebhookEvent, IWebhookFilter } from './webhook.model';

// Email Sync Models
export { default as CrmEmailAccount } from './email-account.model';
export type { ICrmEmailAccount, IOAuthCredentials, IImapConfig, ISmtpConfig } from './email-account.model';

export { default as CrmEmail } from './email.model';
export type { ICrmEmail, IEmailAddress, IEmailAttachment, IEmailTracking } from './email.model';

// Calendar Sync Models
export { default as CrmCalendarAccount } from './calendar-account.model';
export type { ICrmCalendarAccount, ICalendarOAuthCredentials, ICalendarInfo } from './calendar-account.model';

export { default as CrmCalendarEvent } from './calendar-event.model';
export type { ICrmCalendarEvent, IEventOrganizer, IEventAttendee, IEventReminder } from './calendar-event.model';

// Record Link Model (generic any↔any associations)
export { default as CrmRecordLink } from './record-link.model';
export type { ICrmRecordLink, CrmRecordType } from './record-link.model';

// Audit Log Model
export { default as CrmAuditLog } from './audit-log.model';
export type { ICrmAuditLog, AuditAction, AuditSource, IAuditChange } from './audit-log.model';
