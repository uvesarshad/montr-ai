/**
 * Groupable fields per CRM entity for the client-side row grouping in
 * `CrmDataGrid`. These are the simple scalar fields read directly off a row
 * (owner/stage need label resolution supplied by the consumer page).
 */

export interface GroupableField {
  /** Row field key (matches the `key` of CrmDataGridGroupBy). */
  value: string;
  /** Label shown in the "Group by" selector. */
  label: string;
}

export const CONTACT_GROUPABLE_FIELDS: GroupableField[] = [
  { value: 'status', label: 'Status' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'rating', label: 'Rating' },
  { value: 'ownerId', label: 'Owner' },
  { value: 'source', label: 'Source' },
];

export const COMPANY_GROUPABLE_FIELDS: GroupableField[] = [
  { value: 'type', label: 'Type' },
  { value: 'industry', label: 'Industry' },
  { value: 'ownerId', label: 'Owner' },
];

export const DEAL_GROUPABLE_FIELDS: GroupableField[] = [
  { value: 'stageId', label: 'Stage' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'ownerId', label: 'Owner' },
];

/* -------------------------------------------------------------------------
 * Known enum columns for the generalized RecordKanban (so empty columns still
 * render). Mirror the model enums. Values not listed here (owner ids, derived
 * industries) are derived from data by RecordKanban itself.
 * ---------------------------------------------------------------------- */

import type { ChipTone } from '@/components/ui-kit';

export interface KanbanColumnPreset {
  value: string;
  label: string;
  color?: string;
  tone?: ChipTone;
}

export const CONTACT_STATUS_COLUMNS: KanbanColumnPreset[] = [
  { value: 'lead', label: 'Lead', tone: 'info', color: '#60a5fa' },
  { value: 'prospect', label: 'Prospect', tone: 'info', color: '#818cf8' },
  { value: 'customer', label: 'Customer', tone: 'ok', color: '#34d399' },
  { value: 'churned', label: 'Churned', tone: 'danger', color: '#f87171' },
  { value: 'inactive', label: 'Inactive', tone: 'gray', color: '#9ca3af' },
];

export const CONTACT_LIFECYCLE_COLUMNS: KanbanColumnPreset[] = [
  { value: 'subscriber', label: 'Subscriber', color: '#9ca3af' },
  { value: 'lead', label: 'Lead', color: '#60a5fa' },
  { value: 'mql', label: 'MQL', color: '#818cf8' },
  { value: 'sql', label: 'SQL', color: '#a78bfa' },
  { value: 'opportunity', label: 'Opportunity', color: '#fbbf24' },
  { value: 'customer', label: 'Customer', tone: 'ok', color: '#34d399' },
  { value: 'evangelist', label: 'Evangelist', tone: 'ok', color: '#10b981' },
];

export const CONTACT_RATING_COLUMNS: KanbanColumnPreset[] = [
  { value: 'hot', label: 'Hot', tone: 'danger', color: '#f87171' },
  { value: 'warm', label: 'Warm', tone: 'warn', color: '#fbbf24' },
  { value: 'cold', label: 'Cold', tone: 'info', color: '#60a5fa' },
];

export const COMPANY_TYPE_COLUMNS: KanbanColumnPreset[] = [
  { value: 'prospect', label: 'Prospect', tone: 'info', color: '#60a5fa' },
  { value: 'customer', label: 'Customer', tone: 'ok', color: '#34d399' },
  { value: 'partner', label: 'Partner', tone: 'brand', color: '#a78bfa' },
  { value: 'vendor', label: 'Vendor', color: '#fbbf24' },
  { value: 'competitor', label: 'Competitor', tone: 'danger', color: '#f87171' },
];

export const DEAL_STATUS_COLUMNS: KanbanColumnPreset[] = [
  { value: 'open', label: 'Open', tone: 'info', color: '#60a5fa' },
  { value: 'won', label: 'Won', tone: 'ok', color: '#34d399' },
  { value: 'lost', label: 'Lost', tone: 'danger', color: '#f87171' },
  { value: 'abandoned', label: 'Abandoned', tone: 'gray', color: '#9ca3af' },
];

export const DEAL_PRIORITY_COLUMNS: KanbanColumnPreset[] = [
  { value: 'low', label: 'Low', tone: 'info', color: '#60a5fa' },
  { value: 'medium', label: 'Medium', tone: 'warn', color: '#fbbf24' },
  { value: 'high', label: 'High', tone: 'warn', color: '#fb923c' },
  { value: 'urgent', label: 'Urgent', tone: 'danger', color: '#f87171' },
];

/** Returns preset enum columns for a (entity, groupKey) pair, or undefined
 *  when columns should be derived from data (owner, industry, source). */
export function getKanbanColumns(
  entityType: string,
  groupKey: string,
): KanbanColumnPreset[] | undefined {
  if (entityType === 'contact') {
    if (groupKey === 'status') return CONTACT_STATUS_COLUMNS;
    if (groupKey === 'lifecycle') return CONTACT_LIFECYCLE_COLUMNS;
    if (groupKey === 'rating') return CONTACT_RATING_COLUMNS;
  }
  if (entityType === 'company') {
    if (groupKey === 'type') return COMPANY_TYPE_COLUMNS;
  }
  if (entityType === 'deal') {
    if (groupKey === 'status') return DEAL_STATUS_COLUMNS;
    if (groupKey === 'priority') return DEAL_PRIORITY_COLUMNS;
  }
  return undefined;
}

export function getGroupableFields(entityType: string): GroupableField[] {
  switch (entityType) {
    case 'contact':
      return CONTACT_GROUPABLE_FIELDS;
    case 'company':
      return COMPANY_GROUPABLE_FIELDS;
    case 'deal':
      return DEAL_GROUPABLE_FIELDS;
    default:
      return [];
  }
}
