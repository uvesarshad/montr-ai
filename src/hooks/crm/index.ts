/**
 * CRM Hooks Index
 *
 * This file exports all CRM-related React hooks for data fetching,
 * mutations, and state management.
 */

// Core Entity Hooks
export * from './use-contacts';
export * from './use-contact';
export * from './use-companies';
export * from './use-company';
export * from './use-deals';
export * from './use-deal';
export * from './use-pipelines';
export * from './use-tags';

// Activity & Timeline Hooks
export * from './use-activities';
export * from './use-activity';

// Feature Hooks
export * from './use-views';
export * from './use-favorites';
export * from './use-comments';
export * from './use-attachments';

// Custom Fields
export * from './use-custom-fields';

// Search & Stats
export * from './use-crm-search';
export * from './use-crm-stats';

// Utility Hooks
export * from './use-crm-filters';
