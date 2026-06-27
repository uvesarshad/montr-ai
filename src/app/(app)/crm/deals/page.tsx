'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ModuleShell } from '@/components/shell/module-shell';
import { DealKanban } from '@/components/crm/deals/deal-kanban';
import { DealRecordKanban } from '@/components/crm/deals/deal-record-kanban';
import { DealListView } from '@/components/crm/deals/deal-list-view';
import { DealCalendarView } from '@/components/crm/deals/deal-calendar-view';
import { KanbanFilters, KanbanFiltersState } from '@/components/crm/deals/kanban-filters';
import { AddDealButton } from '@/components/crm/deals/add-deal-button';
import { ExportDialog } from '@/components/crm/import/export-dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEAL_GROUPABLE_FIELDS } from '@/components/crm/shared/groupable-fields';
import { LayoutGrid, List, Plus, Download, TrendingUp, CalendarDays } from 'lucide-react';

const DEALS_GROUP_BY_NONE = '__none__';
import { useDebounce } from 'use-debounce';
import { useCrmKeyboard } from '@/hooks/crm/use-crm-keyboard';
import { openAgentLauncher } from '@/lib/agent/launcher';

type ViewMode = 'kanban' | 'list' | 'calendar';

export default function DealsPage() {
  const { push: routerPush } = useRouter();
  // View mode state (kanban or list)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [groupByField, setGroupByField] = useState<string | undefined>(undefined);

  // Filters state
  const [filters, setFilters] = useState<KanbanFiltersState>({
    search: '',
    ownerId: undefined,
    priority: undefined,
    tags: [],
  });

  // Debounce search to avoid too many API calls
  const [debouncedSearch] = useDebounce(filters.search, 300);

  // Load view preference from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem('crm:deals:viewMode');
    if (savedView === 'kanban' || savedView === 'list' || savedView === 'calendar') {
      setViewMode(savedView);
    }
  }, []);

  // Save view preference to localStorage
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('crm:deals:viewMode', mode);
  }, []);

  // Prepare kanban filters with debounced search
  const kanbanFilters = useMemo(() => ({
    search: debouncedSearch,
    ownerId: filters.ownerId,
    priority: filters.priority,
    tags: filters.tags,
  }), [debouncedSearch, filters.ownerId, filters.priority, filters.tags]);

  const listFilters = useMemo(() => ({
    page,
    limit,
    search: debouncedSearch || undefined,
    ownerId: filters.ownerId,
    priority: filters.priority,
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    sort: '-updatedAt',
  }), [debouncedSearch, filters.ownerId, filters.priority, filters.tags, limit, page]);

  useCrmKeyboard({
    onSearch: () => {
      const input = document.querySelector<HTMLInputElement>('input[type="search"]');
      input?.focus();
    },
    onNew: () => routerPush('/crm/deals/new'),
  });

  // Available fields for export
  const exportFields = [
    { value: 'title', label: 'Deal Title' },
    { value: 'value', label: 'Deal Value' },
    { value: 'currency', label: 'Currency' },
    { value: 'status', label: 'Status' },
    { value: 'stage', label: 'Stage' },
    { value: 'priority', label: 'Priority' },
    { value: 'probability', label: 'Win Probability' },
    { value: 'expectedCloseDate', label: 'Expected Close Date' },
    { value: 'actualCloseDate', label: 'Actual Close Date' },
    { value: 'companyName', label: 'Company' },
    { value: 'contactName', label: 'Contact' },
    { value: 'ownerName', label: 'Owner' },
    { value: 'source', label: 'Source' },
    { value: 'lostReason', label: 'Lost Reason' },
    { value: 'description', label: 'Description' },
  ];

  const viewToggle = (
    <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as ViewMode)}>
      <TabsList>
        <TabsTrigger value="kanban" className="gap-2">
          <LayoutGrid className="size-4" />
          Kanban
        </TabsTrigger>
        <TabsTrigger value="list" className="gap-2">
          <List className="size-4" />
          List
        </TabsTrigger>
        <TabsTrigger value="calendar" className="gap-2">
          <CalendarDays className="size-4" />
          Calendar
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const primaryAction = (
    <AddDealButton>
      <Button>
        <Plus className="size-4 mr-2" />
        New Deal
      </Button>
    </AddDealButton>
  );

  const secondaryActions = (
    <>
      {(viewMode === 'list' || viewMode === 'kanban') && (
        <Select
          value={groupByField ?? (viewMode === 'kanban' ? 'stageId' : DEALS_GROUP_BY_NONE)}
          onValueChange={(value) =>
            setGroupByField(
              value === DEALS_GROUP_BY_NONE || value === 'stageId' ? undefined : value,
            )
          }
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue placeholder="Group by" />
          </SelectTrigger>
          <SelectContent>
            {viewMode === 'list' && (
              <SelectItem value={DEALS_GROUP_BY_NONE}>No grouping</SelectItem>
            )}
            {DEAL_GROUPABLE_FIELDS.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                Group: {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
        <Download className="mr-2 size-4" />
        Export
      </Button>
      {viewToggle}
    </>
  );

  const dealsFilterBar = <KanbanFilters filters={filters} onChange={setFilters} />;

  return (
    <ModuleShell
      title="Deals"
      icon={TrendingUp}
      meta="Manage your sales pipeline"
      onAskAI={() =>
        openAgentLauncher({
          prompt: 'Review my deals pipeline and suggest next actions.',
          context: {
            source: 'crm_deals_list',
            entityType: 'deal_list',
            entityLabel: 'Deals',
            route: '/crm/deals',
          },
        })
      }
      secondaryActions={secondaryActions}
      primaryAction={primaryAction}
      filterBar={dealsFilterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {/* Content */}
      {viewMode === 'kanban' ? (
        groupByField && groupByField !== 'stageId' ? (
          <DealRecordKanban
            groupByField={groupByField as 'status' | 'priority' | 'ownerId'}
            filters={listFilters}
            onItemClick={(deal) => routerPush(`/crm/deals/${deal._id}`)}
          />
        ) : (
          <DealKanban filters={kanbanFilters} />
        )
      ) : viewMode === 'calendar' ? (
        <DealCalendarView filters={kanbanFilters} />
      ) : (
        <DealListView
          filters={listFilters}
          groupByField={groupByField}
          onPageChange={setPage}
          onLimitChange={(nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
          }}
        />
      )}

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        entityType="deals"
        availableFields={exportFields}
        filters={kanbanFilters}
      />
    </ModuleShell>
  );
}
