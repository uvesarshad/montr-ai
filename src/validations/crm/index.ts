/**
 * CRM Validation Schemas
 *
 * Central export file for all CRM validation schemas.
 * Import from this file to access any CRM validation schema.
 */

// Core CRM entities
export * from './contact.schema';
export * from './company.schema';
export * from './deal.schema';
export * from './pipeline.schema';
export * from './activity.schema';
export * from './tag.schema';

// Feature entities
export * from './view.schema';
export * from './favorite.schema';
export * from './comment.schema';
export * from './attachment.schema';
export * from './custom-field.schema';
export * from './import.schema';

// Automation entities
export * from './workflow.schema';
export * from './webhook.schema';

// Sync entities
export * from './email-account.schema';
export * from './email.schema';
export * from './calendar-account.schema';
export * from './calendar-event.schema';

// Compliance
export * from './audit-log.schema';
