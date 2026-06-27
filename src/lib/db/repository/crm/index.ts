// CRM Repositories - Index File
// Export all CRM repositories for easy importing

// Core CRM Repositories
export { contactRepository, ContactRepository } from './contact.repository';
export type {
  CreateContactDto,
  UpdateContactDto,
  ContactFilters,
  PaginationOptions,
  PaginatedResult,
} from './contact.repository';

export { companyRepository, CompanyRepository } from './company.repository';
export type { CreateCompanyDto, UpdateCompanyDto, CompanyFilters } from './company.repository';

export { dealRepository, DealRepository } from './deal.repository';
export type { CreateDealDto, UpdateDealDto, DealFilters } from './deal.repository';

export { pipelineRepository, PipelineRepository } from './pipeline.repository';
export type { CreatePipelineDto, UpdatePipelineDto, CreateStageDto } from './pipeline.repository';

export { activityRepository, ActivityRepository } from './activity.repository';
export type { CreateActivityDto, UpdateActivityDto, ActivityFilters } from './activity.repository';

export { tagRepository, TagRepository } from './tag.repository';
export type { CreateTagDto, UpdateTagDto } from './tag.repository';

export { customFieldRepository, CustomFieldRepository } from './custom-field.repository';
export type { CreateCustomFieldDto, UpdateCustomFieldDto } from './custom-field.repository';

export { importRepository, ImportRepository } from './import.repository';
export type { CreateImportDto } from './import.repository';

// Feature Repositories
export { viewRepository, ViewRepository } from './view.repository';
export type { CreateViewDto, UpdateViewDto } from './view.repository';

export { favoriteRepository, FavoriteRepository } from './favorite.repository';
export type { CreateFavoriteDto } from './favorite.repository';

export { commentRepository, CommentRepository } from './comment.repository';
export type { CreateCommentDto, UpdateCommentDto } from './comment.repository';

export { attachmentRepository, AttachmentRepository } from './attachment.repository';
export type { CreateAttachmentDto } from './attachment.repository';

// Automation Repositories
export { workflowRepository, WorkflowRepository } from './workflow.repository';
export type { CreateWorkflowDto, UpdateWorkflowDto } from './workflow.repository';

export { webhookRepository, WebhookRepository } from './webhook.repository';
export type { CreateWebhookDto, UpdateWebhookDto, CreateWebhookLogDto } from './webhook.repository';

// Email Sync Repositories
export { emailAccountRepository, EmailAccountRepository } from './email-account.repository';
export type { CreateEmailAccountDto, UpdateEmailAccountDto } from './email-account.repository';

export { emailRepository, EmailRepository } from './email.repository';
export type { CreateEmailDto, EmailFilters } from './email.repository';

// Calendar Sync Repositories
export { calendarAccountRepository, CalendarAccountRepository } from './calendar-account.repository';
export type { CreateCalendarAccountDto, UpdateCalendarAccountDto } from './calendar-account.repository';

export { calendarEventRepository, CalendarEventRepository } from './calendar-event.repository';
export type { CreateCalendarEventDto, UpdateCalendarEventDto, CalendarEventFilters } from './calendar-event.repository';

// Record Link Repository (generic any↔any associations)
export { recordLinkRepository, RecordLinkRepository } from './record-link.repository';
export type { CreateRecordLinkDto, AnnotatedRecordLink } from './record-link.repository';

// Audit Log Repository
export { auditLogRepository, AuditLogRepository } from './audit-log.repository';
export type { CreateAuditLogDto, AuditLogFilters } from './audit-log.repository';
