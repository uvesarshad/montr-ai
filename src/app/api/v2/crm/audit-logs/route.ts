/**
 * CRM Audit Logs API
 *
 * GET /api/v2/crm/audit-logs - List audit logs with filtering
 */

import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';
import type { AuditAction, AuditSource } from '@/lib/db/models/crm/audit-log.model';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

/**
 * GET /api/v2/crm/audit-logs
 * List audit logs with filtering and pagination
 *
 * Query Parameters:
 * - entityType: Filter by entity type (contact, company, deal, etc.)
 * - entityId: Filter by specific entity ID
 * - action: Filter by action type (created, updated, deleted, etc.)
 * - userId: Filter by user who made the change
 * - source: Filter by source (ui, api, import, workflow, sync, system)
 * - changeField: Filter by changes.field value
 * - dateAfter: Filter by date (ISO string)
 * - dateBefore: Filter by date (ISO string)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25, max: 100)
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');

    // Get user's organization
    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType') || undefined;
    const entityId = searchParams.get('entityId') || undefined;
    const action = searchParams.get('action') as AuditAction | null || undefined;
    const filterUserId = searchParams.get('userId') || undefined;
    const source = searchParams.get('source') as AuditSource | null || undefined;
    const changeField = searchParams.get('changeField') || undefined;
    const dateAfter = searchParams.get('dateAfter') ? new Date(searchParams.get('dateAfter')!) : undefined;
    const dateBefore = searchParams.get('dateBefore') ? new Date(searchParams.get('dateBefore')!) : undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 100);

    // Build filters
    const filters: Record<string, unknown> = {};
    if (entityType) filters.entityType = entityType;
    if (entityId) filters.entityId = entityId;
    if (action) filters.action = action;
    if (filterUserId) filters.userId = filterUserId;
    if (source) filters.source = source;
    if (changeField) filters.changeField = changeField;
    if (dateAfter) filters.dateAfter = dateAfter;
    if (dateBefore) filters.dateBefore = dateBefore;

    // Fetch audit logs
    const result = await auditLogRepository.find(
      filters,
      { page, limit }
    );

    // Fetch user details for each audit log
    const userIds = [...new Set(result.data.map(log => log.userId?.toString()).filter(Boolean))] as string[];
    const users = await Promise.all(
      userIds.map(id => userRepository.findById(id))
    );
    const userMap = new Map(users.filter(Boolean).map(u => [u!._id.toString(), u]));

    // Enrich audit logs with user details
    const enrichedData = result.data.map(log => ({
      _id: log._id.toString(),
      entityType: log.entityType,
      entityId: log.entityId.toString(),
      entityName: log.entityName,
      action: log.action,
      changes: log.changes,
      source: log.source,
      workflowId: log.workflowId?.toString(),
      importId: log.importId?.toString(),
      user: log.userId ? {
        _id: log.userId.toString(),
        name: userMap.get(log.userId.toString())?.name || log.userName || 'Unknown User',
        email: userMap.get(log.userId.toString())?.email,
        image: userMap.get(log.userId.toString())?.image,
      } : {
        _id: 'system',
        name: log.userName || 'System',
        email: null,
        image: null,
      },
      timestamp: log.createdAt,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({
      data: enrichedData,
      pagination: result.pagination,
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Failed to fetch audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
