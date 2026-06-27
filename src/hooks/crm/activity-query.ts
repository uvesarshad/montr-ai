import { ActivityFilters } from './use-activities';

export function buildActivitySearchParams(filters: ActivityFilters = {}) {
  const params = new URLSearchParams();

  if (filters.page) params.append('page', filters.page.toString());
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.search) params.append('search', filters.search);
  if (filters.sort) params.append('sort', filters.sort);

  if (filters.type) {
    const typeValue = Array.isArray(filters.type)
      ? filters.type.join(',')
      : filters.type;
    params.append('type', typeValue);
  }

  if (filters.status) params.append('status', filters.status);
  if (filters.targetType) params.append('targetType', filters.targetType);
  if (filters.targetId) params.append('targetId', filters.targetId);
  if (filters.contactId) params.append('contactId', filters.contactId);
  if (filters.companyId) params.append('companyId', filters.companyId);
  if (filters.dealId) params.append('dealId', filters.dealId);
  if (filters.ownerId) params.append('ownerId', filters.ownerId);
  if (filters.assignedTo) params.append('assignedTo', filters.assignedTo);
  if (filters.overdue !== undefined) params.append('overdue', filters.overdue.toString());

  if (filters.dueAfter) {
    params.append('dueAfter', filters.dueAfter.toISOString());
  }

  if (filters.dueBefore) {
    params.append('dueBefore', filters.dueBefore.toISOString());
  }

  if (filters.completedAfter) {
    params.append('completedAfter', filters.completedAfter.toISOString());
  }

  if (filters.completedBefore) {
    params.append('completedBefore', filters.completedBefore.toISOString());
  }

  return params;
}
