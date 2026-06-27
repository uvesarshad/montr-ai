'use client';

/**
 * Audit Log Viewer Component
 *
 * Displays audit logs for CRM entities with filtering and pagination.
 * Can be embedded in detail pages or used standalone.
 */

import { useReducer, useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  Clock,
  Trash2,
  Edit,
  Plus,
  RotateCcw,
  GitMerge,
  Upload,
  Download,
  Workflow,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { LucideIcon } from 'lucide-react';

interface AuditChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  displayOld?: string;
  displayNew?: string;
}

interface AuditLogEntry {
  _id: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  action: string;
  changes: AuditChange[];
  source: string;
  user: {
    _id: string;
    name: string;
    email?: string;
    image?: string;
  };
  timestamp: string;
  workflowId?: string;
  importId?: string;
}

interface AuditLogViewerProps {
  entityType?: string;
  entityId?: string;
  changeField?: string;
  className?: string;
  showFilters?: boolean;
  defaultLimit?: number;
}

interface FetchState {
  logs: AuditLogEntry[];
  loading: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
  total: number;
}

type FetchAction =
  | { type: 'start' }
  | { type: 'success'; logs: AuditLogEntry[]; hasMore: boolean; total: number; page: number }
  | { type: 'error'; error: string };

const initialFetchState: FetchState = {
  logs: [],
  loading: true,
  error: null,
  page: 1,
  hasMore: false,
  total: 0,
};

function fetchReducer(state: FetchState, action: FetchAction): FetchState {
  switch (action.type) {
    case 'start':
      return { ...state, loading: true, error: null };
    case 'success':
      return {
        ...state,
        loading: false,
        error: null,
        logs: action.logs,
        hasMore: action.hasMore,
        total: action.total,
        page: action.page,
      };
    case 'error':
      return { ...state, loading: false, error: action.error };
    default:
      return state;
  }
}

const ACTION_ICONS: Record<string, LucideIcon> = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  restored: RotateCcw,
  merged: GitMerge,
  imported: Upload,
  exported: Download,
};

const ACTION_COLORS: Record<string, string> = {
  created: 'bg-green-500/10 text-green-700 dark:text-green-400',
  updated: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  deleted: 'bg-red-500/10 text-red-700 dark:text-red-400',
  restored: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  merged: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  imported: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  exported: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  restored: 'Restored',
  merged: 'Merged',
  imported: 'Imported',
  exported: 'Exported',
};

function getActionIcon(action: string) {
  const Icon = ACTION_ICONS[action] || Activity;
  return <Icon className="size-4" />;
}

function getActionBadge(action: string) {
  const colorClass = ACTION_COLORS[action] || 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
  const label = ACTION_LABELS[action] || action;

  return (
    <Badge variant="secondary" className={`${colorClass} border-0`}>
      {getActionIcon(action)}
      <span className="ml-1">{label}</span>
    </Badge>
  );
}

function getUserInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return {
    relative: formatDistanceToNow(date, { addSuffix: true }),
    absolute: date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function renderChangeValue(value: string, isOld: boolean) {
  if (!value) {
    return <span className="text-muted-foreground italic">empty</span>;
  }

  return (
    <span className={isOld ? 'text-red-600 dark:text-red-400 line-through' : 'text-green-600 dark:text-green-400 font-medium'}>
      {value}
    </span>
  );
}

function AuditLogCard({
  log,
  isExpanded,
  onToggle,
}: {
  log: AuditLogEntry;
  isExpanded: boolean;
  onToggle: (logId: string) => void;
}) {
  const time = formatTimestamp(log.timestamp);
  const hasChanges = log.changes && log.changes.length > 0;

  return (
    <Card key={log._id} className="p-4 hover:shadow-sm transition-shadow">
      <div className="flex gap-4">
        <Avatar className="size-10">
          <AvatarImage src={log.user.image || undefined} />
          <AvatarFallback className="text-xs">
            {getUserInitials(log.user.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">
                {log.user.name}
              </span>
              {getActionBadge(log.action)}
              {log.entityName && (
                <span className="text-sm text-muted-foreground">
                  {log.entityType}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
              <Clock className="size-3" />
              <span title={time.absolute}>{time.relative}</span>
            </div>
          </div>

          {log.entityName && (
            <p className="text-sm text-muted-foreground mb-2">
              {log.entityName}
            </p>
          )}

          {log.source !== 'ui' && (
            <Badge variant="outline" className="text-xs mb-2">
              {log.source === 'workflow' && <Workflow className="size-3 mr-1" />}
              {log.source === 'import' && <Upload className="size-3 mr-1" />}
              Source: {log.source}
            </Badge>
          )}

          {hasChanges && (
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggle(log._id)}
                className="h-7 text-xs px-2 -ml-2"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="size-3 mr-1" />
                    Hide Changes
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3 mr-1" />
                    Show {log.changes.length} {log.changes.length === 1 ? 'Change' : 'Changes'}
                  </>
                )}
              </Button>

              {isExpanded && (
                <div className="mt-2 space-y-2 bg-muted/30 rounded-md p-3">
                  {log.changes.map((change) => (
                    <div key={change.field} className="text-sm">
                      <span className="font-medium text-foreground">{change.field}:</span>
                      <div className="mt-1 pl-2 space-y-1">
                        {change.displayOld && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">From:</span>
                            {renderChangeValue(change.displayOld, true)}
                          </div>
                        )}
                        {change.displayNew && (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-xs">To:</span>
                            {renderChangeValue(change.displayNew, false)}
                          </div>
                        )}
                        {!change.displayOld && !change.displayNew && (
                          <span className="text-muted-foreground italic">No details available</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AuditLogViewer({
  entityType,
  entityId,
  changeField,
  className = '',
  showFilters = true,
  defaultLimit = 25,
}: AuditLogViewerProps) {
  const [{ logs, loading, error, page, hasMore, total }, dispatch] = useReducer(
    fetchReducer,
    initialFetchState
  );

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Fetch audit logs
  const fetchLogs = async (currentPage = 1) => {
    try {
      dispatch({ type: 'start' });

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: defaultLimit.toString(),
      });

      if (entityType) params.append('entityType', entityType);
      if (entityId) params.append('entityId', entityId);
      if (changeField) params.append('changeField', changeField);
      if (actionFilter && actionFilter !== 'all') params.append('action', actionFilter);

      // Add date range filter
      if (dateRangeFilter !== 'all') {
        const now = new Date();
        let dateAfter: Date | null = null;

        switch (dateRangeFilter) {
          case 'today':
            dateAfter = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            dateAfter = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            dateAfter = new Date(now.setMonth(now.getMonth() - 1));
            break;
          case 'quarter':
            dateAfter = new Date(now.setMonth(now.getMonth() - 3));
            break;
        }

        if (dateAfter) {
          params.append('dateAfter', dateAfter.toISOString());
        }
      }

      const response = await fetch(`/api/v2/crm/audit-logs?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data = await response.json();
      dispatch({
        type: 'success',
        logs: data.data || [],
        hasMore: data.pagination?.hasMore || false,
        total: data.pagination?.total || 0,
        page: currentPage,
      });
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      dispatch({
        type: 'error',
        error: err instanceof Error ? err.message : 'Failed to fetch audit logs',
      });
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, actionFilter, dateRangeFilter]);

  const toggleExpanded = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  if (loading && logs.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        {showFilters && (
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        )}
        {[1, 2, 3].map(i => (
          <Card key={i} className="p-4">
            <div className="flex gap-4">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="size-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load activity history</p>
          <Button variant="outline" onClick={() => fetchLogs(1)}>
            Try Again
          </Button>
        </div>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className={`p-12 ${className}`}>
        <div className="text-center">
          <Activity className="size-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Activity Yet</h3>
          <p className="text-sm text-muted-foreground">
            {entityType && entityId
              ? 'This record has no activity history.'
              : 'No audit logs found matching your filters.'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="restored">Restored</SelectItem>
              <SelectItem value="merged">Merged</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
              <SelectItem value="exported">Exported</SelectItem>
            </SelectContent>
          </Select>

          <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
              <SelectItem value="quarter">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          <div className="text-sm text-muted-foreground flex items-center ml-auto">
            {total > 0 && `${total} total ${total === 1 ? 'event' : 'events'}`}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {logs.map(log => (
          <AuditLogCard
            key={log._id}
            log={log}
            isExpanded={expandedLogs.has(log._id)}
            onToggle={toggleExpanded}
          />
        ))}
      </div>

      {(hasMore || page > 1) && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => fetchLogs(page - 1)}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>

          <span className="text-sm text-muted-foreground px-4">
            Page {page}
          </span>

          <Button
            variant="outline"
            onClick={() => fetchLogs(page + 1)}
            disabled={!hasMore || loading}
          >
            {loading ? 'Loading...' : 'Next'}
          </Button>
        </div>
      )}
    </div>
  );
}
