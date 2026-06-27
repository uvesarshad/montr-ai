/**
 * CRM Audit Logging Helper
 *
 * This module provides helper functions for logging audit events in the CRM system.
 * All CRM operations should use these helpers to maintain a complete audit trail.
 */

import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import { IAuditChange, AuditAction, AuditSource } from '@/lib/db/models/crm/audit-log.model';
import { getClientIp } from '@/lib/rate-limiter';

/**
 * Sensitive fields that should not be logged in audit logs
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'hashedPassword',
  'apiKey',
  'secretKey',
  'accessToken',
  'refreshToken',
  'creditCard',
  'ssn',
  'socialSecurityNumber',
  'bankAccount',
]);

/**
 * Internal fields that should be excluded from change tracking
 */
const EXCLUDED_FIELDS = new Set([
  '_id',
  '__v',
  'createdAt',
  'updatedAt',
  'organizationId',
]);

/**
 * Field label mapping for common CRM fields
 */
const FIELD_LABELS: Record<string, string> = {
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email',
  phone: 'Phone',
  jobTitle: 'Job Title',
  department: 'Department',
  companyId: 'Company',
  ownerId: 'Owner',
  status: 'Status',
  lifecycle: 'Lifecycle Stage',
  rating: 'Rating',
  source: 'Source',
  tags: 'Tags',
  assignedTo: 'Assigned To',
  dueDate: 'Due Date',
  priority: 'Priority',
  value: 'Value',
  currency: 'Currency',
  probability: 'Probability',
  stageId: 'Stage',
  pipelineId: 'Pipeline',
  name: 'Name',
  description: 'Description',
  website: 'Website',
  domain: 'Domain',
  industry: 'Industry',
  size: 'Company Size',
  type: 'Type',
};

/**
 * Get request metadata from Next.js request
 */
export function getRequestMetadata(request?: Request): { ipAddress?: string; userAgent?: string } {
  if (!request) return {};

  // Use the proxy-aware helper so audit-log entries reflect the real client
  // IP behind any configured proxy chain — not a forged `x-forwarded-for`.
  const resolvedIp = getClientIp(request.headers);
  const ipAddress = resolvedIp === 'unknown' ? undefined : resolvedIp;

  const userAgent = request.headers.get('user-agent') || undefined;

  return { ipAddress, userAgent };
}

/**
 * Calculate field changes between old and new data
 */
export function calculateChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  includeAllFields = false
): IAuditChange[] {
  const changes: IAuditChange[] = [];

  // Get all unique keys
  const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

  for (const field of allKeys) {
    // Skip excluded fields
    if (EXCLUDED_FIELDS.has(field)) continue;

    // Skip sensitive fields
    if (SENSITIVE_FIELDS.has(field)) continue;

    const oldValue = oldData?.[field];
    const newValue = newData?.[field];

    // Skip if values are the same
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

    // For updates, skip if field was not in newData (only track explicitly changed fields)
    if (!includeAllFields && oldData && newData && !(field in newData)) continue;

    changes.push({
      field: FIELD_LABELS[field] || field,
      oldValue,
      newValue,
      displayOld: formatValue(oldValue),
      displayNew: formatValue(newValue),
    });
  }

  return changes;
}

/**
 * Format a value for display in audit logs
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    // Handle array of objects with common id field
    if (typeof value[0] === 'object' && value[0] !== null) {
      return value.map((v: Record<string, unknown>) => v.name || v.label || v._id || v.id || JSON.stringify(v)).join(', ');
    }
    return value.join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    // Handle specific object types
    const obj = value as Record<string, unknown>;
    if (obj._id || obj.id) {
      return String(obj.name || obj.label || obj.email || (obj._id as { toString?(): string } | null)?.toString?.() || (obj.id as { toString?(): string } | null)?.toString?.() || '');
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value);
}

/**
 * Get entity display name from the data
 */
export function getEntityName(entityType: string, data: Record<string, unknown>): string {
  switch (entityType) {
    case 'contact':
      return `${data.firstName || ''} ${data.lastName || ''}`.trim() || String(data.email || '') || 'Contact';
    case 'company':
      return String(data.name || data.domain || 'Company');
    case 'deal':
      return String(data.name || `Deal #${data._id}`);
    case 'activity':
      return String(data.title || data.type || 'Activity');
    case 'tag':
      return String(data.name || 'Tag');
    case 'view':
      return String(data.name || 'View');
    case 'workflow':
      return String(data.name || 'Workflow');
    case 'webhook':
      return String(data.name || data.url || 'Webhook');
    default:
      return entityType;
  }
}

/**
 * Log a create event
 */
export async function logCreate(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  userId: string,
  userName: string,
  source: AuditSource = 'ui',
  metadata?: { ipAddress?: string; userAgent?: string; workflowId?: string; importId?: string }
): Promise<void> {
  try {
    const entityName = getEntityName(entityType, data);

    await auditLogRepository.create({
      entityType,
      entityId,
      entityName,
      action: 'created',
      changes: [],
      source,
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log create event:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Log an update event with field changes
 */
export async function logUpdate(
  entityType: string,
  entityId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  userId: string,
  userName: string,
  source: AuditSource = 'ui',
  metadata?: { ipAddress?: string; userAgent?: string; workflowId?: string }
): Promise<void> {
  try {
    const changes = calculateChanges(oldData, newData);

    // Don't log if there are no actual changes
    if (changes.length === 0) return;

    const entityName = getEntityName(entityType, newData);

    await auditLogRepository.create({
      entityType,
      entityId,
      entityName,
      action: 'updated',
      changes,
      source,
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log update event:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Log a delete event
 */
export async function logDelete(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  userId: string,
  userName: string,
  source: AuditSource = 'ui',
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  try {
    const entityName = getEntityName(entityType, data);

    await auditLogRepository.create({
      entityType,
      entityId,
      entityName,
      action: 'deleted',
      changes: [],
      source,
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log delete event:', error);
    // Don't throw - audit logging should not break the main operation
  }
}

/**
 * Log a restore event
 */
export async function logRestore(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
  userId: string,
  userName: string,
  source: AuditSource = 'ui',
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  try {
    const entityName = getEntityName(entityType, data);

    await auditLogRepository.create({
      entityType,
      entityId,
      entityName,
      action: 'restored',
      changes: [],
      source,
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log restore event:', error);
  }
}

/**
 * Log a merge event
 */
export async function logMerge(
  entityType: string,
  primaryEntityId: string,
  mergedEntityIds: string[],
  data: Record<string, unknown>,
  userId: string,
  userName: string,
  source: AuditSource = 'ui',
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  try {
    const entityName = getEntityName(entityType, data);

    await auditLogRepository.create({
      entityType,
      entityId: primaryEntityId,
      entityName,
      action: 'merged',
      changes: [
        {
          field: 'Merged Records',
          oldValue: mergedEntityIds,
          newValue: primaryEntityId,
          displayOld: `${mergedEntityIds.length} records`,
          displayNew: entityName,
        },
      ],
      source,
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log merge event:', error);
  }
}

/**
 * Log a custom action (e.g., tag added, stage changed, owner changed)
 */
export async function logCustomAction(
  entityType: string,
  entityId: string,
  action: AuditAction,
  changes: IAuditChange[],
  data: Record<string, unknown>,
  userId: string,
  userName: string,
  source: AuditSource = 'ui',
  metadata?: { ipAddress?: string; userAgent?: string; workflowId?: string }
): Promise<void> {
  try {
    const entityName = getEntityName(entityType, data);

    await auditLogRepository.create({
      entityType,
      entityId,
      entityName,
      action,
      changes,
      source,
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log custom action:', error);
  }
}

/**
 * Log an import event
 */
export async function logImport(
  entityType: string,
  importId: string,
  importedCount: number,
  userId: string,
  userName: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  try {
    await auditLogRepository.create({
      entityType: 'import',
      entityId: importId,
      entityName: `${entityType} import`,
      action: 'imported',
      changes: [
        {
          field: 'Records Imported',
          oldValue: 0,
          newValue: importedCount,
          displayOld: '0',
          displayNew: String(importedCount),
        },
      ],
      source: 'import',
      userId,
      userName,
      importId,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log import event:', error);
  }
}

/**
 * Log an export event
 */
export async function logExport(
  entityType: string,
  exportedCount: number,
  userId: string,
  userName: string,
  metadata?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  try {
    await auditLogRepository.create({
      entityType,
      entityId: new Date().getTime().toString(), // Use timestamp as pseudo-id
      entityName: `${entityType} export`,
      action: 'exported',
      changes: [
        {
          field: 'Records Exported',
          oldValue: 0,
          newValue: exportedCount,
          displayOld: '0',
          displayNew: String(exportedCount),
        },
      ],
      source: 'ui',
      userId,
      userName,
      ...metadata,
    });
  } catch (error) {
    console.error('Failed to log export event:', error);
  }
}
