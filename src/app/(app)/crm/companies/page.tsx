'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanies, CompanyFilters as CompanyFilterType } from '@/hooks/crm/use-companies';
import { ModuleShell } from '@/components/shell/module-shell';
import { Input } from '@/components/ui/input';
import { CrmDataGrid } from '@/components/crm/shared/crm-data-grid';
import { CrmPagination } from '@/components/crm/shared/crm-pagination';
import { CrmFilters } from '@/components/crm/shared/crm-filters';
import { BulkActionsToolbar } from '@/components/crm/shared/bulk-actions-toolbar';
import { RunAutomationMenu } from '@/components/crm/run-automation-menu';
import { getCompanyColumns } from '@/components/crm/companies/company-table-columns';
import { CompanyFilters } from '@/components/crm/companies/company-filters';
import { CreateCompanyButton } from '@/components/crm/companies/create-company-button';
import { ExportDialog } from '@/components/crm/import/export-dialog';
import { Company } from '@/types/crm';
import { View } from '@/types/crm';
import { useDebounce } from 'use-debounce';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Building2, Download, FileUp, Filter, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { bulkDeleteCompanies } from '@/components/crm/shared/bulk-actions';
import { ViewSelector } from '@/components/crm/views';
import { ViewEditor } from '@/components/crm/views';
import { RecordPreviewPanel } from '@/components/crm/shared/record-preview-panel';
import { RecordKanban } from '@/components/crm/shared/record-kanban';
import { getKanbanColumns } from '@/components/crm/shared/groupable-fields';
import { Segmented } from '@/components/ui-kit';
import { toast as sonnerToast } from 'sonner';
import { applyCompanyViewFilters, buildCompanyViewFilters } from '@/components/crm/companies/company-view-filters';
import { useFavorites } from '@/hooks/crm/use-favorites';
import { buildCompanyListInsights, type ListInsight } from '@/lib/crm/ai-insights';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { useCrmKeyboard } from '@/hooks/crm/use-crm-keyboard';

function CompanyInsightsGrid({
  insights,
  onOpenAgent,
}: {
  insights: ListInsight[];
  onOpenAgent: (prompt: string, metric: string) => void;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {insights.map((insight) => (
        <div key={insight.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">{insight.metric}</div>
              <div className="mt-1 text-[13px] font-semibold">{insight.title}</div>
            </div>
            <div className="flex-shrink-0 rounded-full bg-primary/10 p-1.5 text-primary">
              <Sparkles className="size-3" />
            </div>
          </div>
          <p className="text-[12px] leading-[1.55] text-muted-foreground">{insight.summary}</p>
          <Button size="sm" variant="outline" className="h-7 w-fit rounded-[7px] text-[11px]" onClick={() => onOpenAgent(insight.prompt, insight.metric)}>
            <Sparkles className="mr-1.5 size-3" />
            {insight.actionLabel}
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function CompaniesPage() {
  const { toast } = useToast();
  const { push: routerPush } = useRouter();

  // Filter state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [type, setType] = useState<string>('');
  const [industry, setIndustry] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCompanies, setSelectedCompanies] = useState<Company[]>([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedView, setSelectedView] = useState<View | null>(null);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [favoriteCompanyIds, setFavoriteCompanyIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [layout, setLayout] = useState<'table' | 'kanban'>('table');

  // When no view is active, default to opening records in the side panel.
  const openRecordIn = selectedView?.openRecordIn ?? 'panel';

  // Build filters
  const filters: CompanyFilterType = useMemo(
    () => applyCompanyViewFilters(
      {
        page,
        limit,
        search: debouncedSearch,
        type: type && type !== 'all' ? type : undefined,
        industry: industry && industry !== 'all' ? industry : undefined,
        size: size && size !== 'all' ? size : undefined,
        sort: '-createdAt',
      },
      selectedView?.filters || []
    ),
    [page, limit, debouncedSearch, type, industry, size, selectedView]
  );

  const { companies, loading, error, pagination, refetch } = useCompanies(filters);
  const { favorites: companyFavorites } = useFavorites({ targetType: 'company' });
  const companyInsights = useMemo(() => buildCompanyListInsights(companies), [companies]);
  const initialViewFilters = useMemo(
    () => buildCompanyViewFilters({
      type: type && type !== 'all' ? type : undefined,
      industry: industry && industry !== 'all' ? industry : undefined,
      size: size && size !== 'all' ? size : undefined,
      search: debouncedSearch || undefined,
    }),
    [type, industry, size, debouncedSearch]
  );

  useEffect(() => {
    setFavoriteCompanyIds(new Set(companyFavorites.map((favorite) => favorite.targetId)));
  }, [companyFavorites]);

  useCrmKeyboard({
    onSearch: () => {
      const input = document.querySelector<HTMLInputElement>('input[type="search"]');
      input?.focus();
    },
    onNew: () => routerPush('/crm/companies/new'),
  });

  // Available fields for export
  const exportFields = [
    { value: 'name', label: 'Company Name' },
    { value: 'domain', label: 'Domain' },
    { value: 'type', label: 'Type' },
    { value: 'industry', label: 'Industry' },
    { value: 'size', label: 'Company Size' },
    { value: 'revenue', label: 'Annual Revenue' },
    { value: 'employees', label: 'Number of Employees' },
    { value: 'phone', label: 'Phone' },
    { value: 'email', label: 'Email' },
    { value: 'address', label: 'Address' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'country', label: 'Country' },
    { value: 'postalCode', label: 'Postal Code' },
    { value: 'website', label: 'Website' },
    { value: 'linkedIn', label: 'LinkedIn' },
    { value: 'twitter', label: 'Twitter' },
    { value: 'description', label: 'Description' },
  ];

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (type && type !== 'all') count++;
    if (industry && industry !== 'all') count++;
    if (size && size !== 'all') count++;
    count += selectedView?.filters.length || 0;
    return count;
  }, [type, industry, size, selectedView]);

  const handleClearFilters = () => {
    setType('');
    setIndustry('');
    setSize('');
  };

  const handleDelete = useCallback(async (company: Company) => {
    if (!confirm(`Are you sure you want to delete ${company.name}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/crm/companies/${company._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete company');
      }

      toast({
        title: 'Company deleted',
        description: 'The company has been successfully deleted.',
      });

      refetch();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete company. Please try again.',
      });
    }
  }, [refetch, toast]);

  const handleFavoriteToggle = useCallback((targetId: string, isFavorite: boolean) => {
    setFavoriteCompanyIds((previous) => {
      const next = new Set(previous);

      if (isFavorite) {
        next.add(targetId);
      } else {
        next.delete(targetId);
      }

      return next;
    });
  }, []);

  const openAgent = useCallback((prompt: string, metric: string) => {
    openAgentLauncher({
      prompt,
      context: {
        source: 'crm_companies_list',
        entityType: 'company_list',
        entityLabel: 'Companies',
        route: '/crm/companies',
        notes: [
          `Metric: ${metric}`,
          `Visible companies: ${companies.length}`,
          selectedView ? `Saved view: ${selectedView.name}` : '',
        ].filter((note): note is string => Boolean(note)),
      },
    });
  }, [companies.length, selectedView]);

  // Kanban: group by the view's groupBy (default type). type/industry are
  // simple fields; owner move sets ownerId. industry columns derive from data.
  const kanbanGroupKey = (selectedView?.groupBy || 'type') as keyof Company & string;
  const handleCompanyMove = useCallback(
    async (company: Company, toValue: string) => {
      const field = kanbanGroupKey === 'ownerId' ? 'ownerId' : kanbanGroupKey;
      const res = await fetch(`/api/v2/crm/companies/${company._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: toValue }),
      });
      if (!res.ok) throw new Error('Failed to update company');
      sonnerToast.success('Company moved');
      void refetch();
    },
    [kanbanGroupKey, refetch]
  );

  const companyOwnerValue = useCallback((company: Company): string | undefined => {
    const o = company.ownerId as unknown;
    if (!o) return undefined;
    if (typeof o === 'object' && o !== null && '_id' in o) return String((o as { _id: string })._id);
    return String(o);
  }, []);

  const columns = useMemo(
    () => getCompanyColumns(undefined, handleDelete, {
      isFavorite: (targetId) => favoriteCompanyIds.has(targetId),
      onFavoriteToggle: handleFavoriteToggle,
    }),
    [favoriteCompanyIds, handleDelete, handleFavoriteToggle]
  );

  const filterComponents = [
    {
      key: 'type',
      label: 'Type',
      component: (
        <CompanyFilters
          type={type}
          onTypeChange={(value) => {
            setType(value);
            setPage(1);
          }}
        />
      ),
    },
    {
      key: 'industry',
      label: 'Industry',
      component: (
        <CompanyFilters
          industry={industry}
          onIndustryChange={(value) => {
            setIndustry(value);
            setPage(1);
          }}
        />
      ),
    },
    {
      key: 'size',
      label: 'Company Size',
      component: (
        <CompanyFilters
          size={size}
          onSizeChange={(value) => {
            setSize(value);
            setPage(1);
          }}
        />
      ),
    },
  ];

  const filterBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="h-9 pl-8"
          />
        </div>
        <ViewSelector
          entityType="company"
          selectedViewId={selectedView?._id}
          onViewSelect={(view) => {
            setSelectedView(view);
            setPage(1);
          }}
        />
        <Segmented
          value={layout}
          onChange={(v) => setLayout(v as 'table' | 'kanban')}
          options={[
            { value: 'table', label: 'Table' },
            { value: 'kanban', label: 'Kanban' },
          ]}
          className="shrink-0"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="mr-1.5 size-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[var(--accent-100)] px-1.5 text-[11px] font-bold tabular-nums text-[var(--accent-700)]">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>
      {selectedView && (
        <span className="shrink-0 text-[12px] text-muted-foreground">
          View: <span className="font-medium text-foreground">{selectedView.name}</span>
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-9 shrink-0"
        onClick={() => setShowSaveViewDialog(true)}
      >
        Save view
      </Button>
    </div>
  );

  const companiesSecondaryActions = (
    <>
      <Link href="/crm/import?type=company">
        <Button variant="outline" size="sm">
          <FileUp className="mr-2 size-4" />
          Import
        </Button>
      </Link>
      <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
        <Download className="mr-2 size-4" />
        Export
      </Button>
    </>
  );

  return (
    <ModuleShell
      title="Companies"
      icon={Building2}
      meta={pagination ? `${pagination.total} total` : 'Manage your companies and accounts'}
      onAskAI={() => openAgent('Help me understand and act on my companies.', 'companies_overview')}
      secondaryActions={companiesSecondaryActions}
      primaryAction={<CreateCompanyButton />}
      filterBar={filterBar}
      error={error ? { title: 'Error loading companies', message: error, onRetry: refetch } : null}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {showFilters && (
        <CrmFilters
          filters={filterComponents}
          onClearAll={handleClearFilters}
          show={showFilters}
        />
      )}

      {companyInsights.length > 0 && (
        <CompanyInsightsGrid insights={companyInsights} onOpenAgent={openAgent} />
      )}

      {selectedCompanies.length > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedCompanies.length}
          onClearSelection={() => setSelectedCompanies([])}
          extraActions={
            <RunAutomationMenu
              entityType="company"
              recordIds={selectedCompanies.map((c) => c._id)}
              availability="bulk"
            />
          }
          onAssignOwner={() => {
            toast({ title: 'Assign Owner', description: 'This feature will be available soon.' });
          }}
          onAddTags={() => {
            toast({ title: 'Add Tags', description: 'This feature will be available soon.' });
          }}
          onDelete={() => {
            if (confirm(`Delete ${selectedCompanies.length} companies?`)) {
              void (async () => {
                try {
                  const deletedCount = await bulkDeleteCompanies(
                    selectedCompanies.map((company) => company._id)
                  );
                  setSelectedCompanies([]);
                  toast({
                    title: 'Companies deleted',
                    description: `${deletedCount} compan${deletedCount === 1 ? 'y' : 'ies'} deleted successfully.`,
                  });
                  await refetch();
                } catch (error) {
                  toast({
                    variant: 'destructive',
                    title: 'Bulk delete failed',
                    description: error instanceof Error ? error.message : 'Failed to delete companies.',
                  });
                }
              })();
            }
          }}
        />
      )}

      {layout === 'kanban' ? (
        <RecordKanban<Company>
          items={companies}
          groupKey={kanbanGroupKey}
          columns={getKanbanColumns('company', kanbanGroupKey)}
          getId={(c) => c._id}
          getGroupValue={kanbanGroupKey === 'ownerId' ? companyOwnerValue : undefined}
          getLabel={(c) => c.name}
          getSubtitle={(c) => c.industry || c.domain || c.website || undefined}
          onItemClick={
            openRecordIn === 'page'
              ? (c) => routerPush(`/crm/companies/${c._id}`)
              : (c) => setPreviewId(c._id)
          }
          onMoveItem={kanbanGroupKey === 'ownerId' ? undefined : handleCompanyMove}
          note={
            pagination && companies.length < pagination.total
              ? `Showing first ${companies.length} of ${pagination.total} companies`
              : undefined
          }
        />
      ) : (
      <div className="rounded-xl border border-border bg-card p-0.5">
        <CrmDataGrid
          className="border-none"
          columns={columns}
          data={companies}
          loading={loading}
          enableRowSelection
          enableSorting
          onRowSelectionChange={setSelectedCompanies}
          getRowId={(row) => row._id}
          groupBy={selectedView?.groupBy ? { key: selectedView.groupBy } : undefined}
          onRowClick={
            openRecordIn === 'page'
              ? (company) => routerPush(`/crm/companies/${company._id}`)
              : (company) => setPreviewId(company._id)
          }
          emptyMessage="No companies found"
          emptyDescription="Get started by creating your first company"
          mobileCard={(company) => (
            <Link href={`/crm/companies/${company._id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={company.logo} alt={company.name} />
                <AvatarFallback className="text-sm font-medium">
                  <Building2 className="size-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{company.name}</p>
                {company.industry && <p className="truncate text-xs text-muted-foreground">{company.industry}</p>}
              </div>
              {company.type && (
                <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                  {company.type}
                </Badge>
              )}
            </Link>
          )}
        />
      </div>
      )}

      {pagination && (
        <CrmPagination
          pagination={pagination}
          onPageChange={setPage}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
        />
      )}

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        entityType="companies"
        availableFields={exportFields}
        filters={filters}
        selectedIds={selectedCompanies.map((c) => c._id)}
      />

      <RecordPreviewPanel
        entityType="company"
        recordId={previewId}
        open={previewId !== null}
        onOpenChange={(open) => { if (!open) setPreviewId(null); }}
      />

      <ViewEditor
        open={showSaveViewDialog}
        onOpenChange={setShowSaveViewDialog}
        entityType="company"
        initialFilters={initialViewFilters}
        onSave={(view) => {
          setSelectedView(view);
          setShowSaveViewDialog(false);
          setPage(1);
          toast({
            title: 'View saved',
            description: `"${view.name}" is now available in your saved views.`,
          });
        }}
      />
    </ModuleShell>
  );
}
