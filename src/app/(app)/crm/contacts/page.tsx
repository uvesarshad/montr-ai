'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useContacts, ContactFilters as ContactFilterType } from '@/hooks/crm/use-contacts';
import { ModuleShell } from '@/components/shell/module-shell';
import { Input } from '@/components/ui/input';
import { CrmDataGrid } from '@/components/crm/shared/crm-data-grid';
import { CrmPagination } from '@/components/crm/shared/crm-pagination';
import { CrmFilters } from '@/components/crm/shared/crm-filters';
import { BulkActionsToolbar } from '@/components/crm/shared/bulk-actions-toolbar';
import { RecordPreviewPanel } from '@/components/crm/shared/record-preview-panel';
import { RecordKanban } from '@/components/crm/shared/record-kanban';
import { getKanbanColumns } from '@/components/crm/shared/groupable-fields';
import { RunAutomationMenu } from '@/components/crm/run-automation-menu';
import { Segmented } from '@/components/ui-kit';
import { toast as sonnerToast } from 'sonner';
import { getContactColumns } from '@/components/crm/contacts/contact-table-columns';
import { ContactFilters } from '@/components/crm/contacts/contact-filters';
import { CreateContactButton } from '@/components/crm/contacts/create-contact-button';
import { ExportDialog } from '@/components/crm/import/export-dialog';
import { Contact } from '@/types/crm';
import { View } from '@/types/crm';
import { useDebounce } from 'use-debounce';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Download, FileUp, Filter, Search, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { bulkDeleteContacts } from '@/components/crm/shared/bulk-actions';
import { ViewSelector } from '@/components/crm/views';
import { ViewEditor } from '@/components/crm/views';
import { applyContactViewFilters, buildContactViewFilters } from '@/components/crm/contacts/contact-view-filters';
import { useFavorites } from '@/hooks/crm/use-favorites';
import { buildContactListInsights, type ListInsight } from '@/lib/crm/ai-insights';
import { openAgentLauncher } from '@/lib/agent/launcher';
import { useCrmKeyboard } from '@/hooks/crm/use-crm-keyboard';

function ContactInsightsGrid({
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

export default function ContactsPage() {
  const { toast } = useToast();
  const { push: routerPush } = useRouter();

  // Filter state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [status, setStatus] = useState<string>('');
  const [lifecycle, setLifecycle] = useState<string>('');
  const [rating, setRating] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedView, setSelectedView] = useState<View | null>(null);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [favoriteContactIds, setFavoriteContactIds] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [layout, setLayout] = useState<'table' | 'kanban'>('table');

  // Nested filter tree from the selected view (wins over legacy flat filters).
  const selectedTree = (selectedView as { filterTree?: unknown } | null)?.filterTree;

  // Build filters
  const filters: ContactFilterType = useMemo(() => {
    const base: ContactFilterType = {
      page,
      limit,
      search: debouncedSearch,
      status: status && status !== 'all' ? status : undefined,
      lifecycle: lifecycle && lifecycle !== 'all' ? lifecycle : undefined,
      rating: rating && rating !== 'all' ? rating : undefined,
      sort: '-createdAt',
    };
    // When the view defines a nested tree, send it to the server (the source of
    // truth at query time) and skip the legacy flat-filter mapping.
    if (selectedTree) {
      base.filterTree = selectedTree;
      return base;
    }
    return applyContactViewFilters(base, selectedView?.filters || []);
  }, [page, limit, debouncedSearch, status, lifecycle, rating, selectedView, selectedTree]);

  const { contacts, loading, error, pagination, refetch } = useContacts(filters);
  const { favorites: contactFavorites } = useFavorites({ targetType: 'contact' });
  const contactInsights = useMemo(() => buildContactListInsights(contacts), [contacts]);
  const initialViewFilters = useMemo(
    () => buildContactViewFilters({
      status: status && status !== 'all' ? status : undefined,
      lifecycle: lifecycle && lifecycle !== 'all' ? lifecycle : undefined,
      rating: rating && rating !== 'all' ? rating : undefined,
      search: debouncedSearch || undefined,
    }),
    [status, lifecycle, rating, debouncedSearch]
  );

  useEffect(() => {
    setFavoriteContactIds(new Set(contactFavorites.map((favorite) => favorite.targetId)));
  }, [contactFavorites]);

  useCrmKeyboard({
    onSearch: () => {
      const input = document.querySelector<HTMLInputElement>('input[type="search"]');
      input?.focus();
    },
    onNew: () => routerPush('/crm/contacts/new'),
  });

  // Available fields for export
  const exportFields = [
    { value: 'firstName', label: 'First Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'companyName', label: 'Company' },
    { value: 'jobTitle', label: 'Job Title' },
    { value: 'status', label: 'Status' },
    { value: 'lifecycle', label: 'Lifecycle Stage' },
    { value: 'rating', label: 'Rating' },
    { value: 'address', label: 'Address' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'country', label: 'Country' },
    { value: 'postalCode', label: 'Postal Code' },
    { value: 'website', label: 'Website' },
    { value: 'source', label: 'Source' },
    { value: 'notes', label: 'Notes' },
  ];

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (status && status !== 'all') count++;
    if (lifecycle && lifecycle !== 'all') count++;
    if (rating && rating !== 'all') count++;
    count += selectedView?.filters.length || 0;
    return count;
  }, [status, lifecycle, rating, selectedView]);

  const handleClearFilters = () => {
    setStatus('');
    setLifecycle('');
    setRating('');
  };

  const handleDelete = useCallback(async (contact: Contact) => {
    if (!confirm(`Are you sure you want to delete ${contact.firstName} ${contact.lastName}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/crm/contacts/${contact._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete contact');
      }

      toast({
        title: 'Contact deleted',
        description: 'The contact has been successfully deleted.',
      });

      refetch();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete contact. Please try again.',
      });
    }
  }, [refetch, toast]);

  const handleFavoriteToggle = useCallback((targetId: string, isFavorite: boolean) => {
    setFavoriteContactIds((previous) => {
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
        source: 'crm_contacts_list',
        entityType: 'contact_list',
        entityLabel: 'Contacts',
        route: '/crm/contacts',
        notes: [
          `Metric: ${metric}`,
          `Visible contacts: ${contacts.length}`,
          selectedView ? `Saved view: ${selectedView.name}` : '',
        ].filter((note): note is string => Boolean(note)),
      },
    });
  }, [contacts.length, selectedView]);

  const columns = useMemo(
    () => getContactColumns(undefined, handleDelete, {
      isFavorite: (targetId) => favoriteContactIds.has(targetId),
      onFavoriteToggle: handleFavoriteToggle,
    }),
    [favoriteContactIds, handleDelete, handleFavoriteToggle]
  );

  // Kanban: group by the view's groupBy, defaulting to status. Only the
  // status/lifecycle/rating enum fields support drag-to-move (PATCH the field).
  const kanbanGroupKey = (selectedView?.groupBy || 'status') as keyof Contact & string;
  const movableContactFields = new Set(['status', 'lifecycle', 'rating']);
  const handleContactMove = useCallback(
    async (contact: Contact, toValue: string) => {
      const res = await fetch(`/api/v2/crm/contacts/${contact._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [kanbanGroupKey]: toValue }),
      });
      if (!res.ok) throw new Error('Failed to update contact');
      sonnerToast.success('Contact moved');
      void refetch();
    },
    [kanbanGroupKey, refetch]
  );

  const openRecord = useCallback(
    (contactId: string) => {
      if ((selectedView?.openRecordIn ?? 'panel') === 'page') {
        routerPush(`/crm/contacts/${contactId}`);
      } else {
        setPreviewId(contactId);
      }
    },
    [selectedView, routerPush]
  );

  const filterComponents = [
    {
      key: 'status',
      label: 'Status',
      component: (
        <ContactFilters
          status={status}
          onStatusChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      ),
    },
    {
      key: 'lifecycle',
      label: 'Lifecycle Stage',
      component: (
        <ContactFilters
          lifecycle={lifecycle}
          onLifecycleChange={(value) => {
            setLifecycle(value);
            setPage(1);
          }}
        />
      ),
    },
    {
      key: 'rating',
      label: 'Rating',
      component: (
        <ContactFilters
          rating={rating}
          onRatingChange={(value) => {
            setRating(value);
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
            placeholder="Search contacts…"
            className="h-9 pl-8"
          />
        </div>
        <ViewSelector
          entityType="contact"
          selectedViewId={selectedView?._id}
          onViewSelect={(view) => {
            setSelectedView(view);
            setPage(1);
          }}
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
      <Segmented
        value={layout}
        onChange={(v) => setLayout(v as 'table' | 'kanban')}
        options={[
          { value: 'table', label: 'Table' },
          { value: 'kanban', label: 'Kanban' },
        ]}
      />
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

  const contactsSecondaryActions = (
    <>
      <Link href="/crm/import?type=contact">
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
      title="Contacts"
      icon={Users}
      meta={pagination ? `${pagination.total} total` : 'Manage your contacts and leads'}
      onAskAI={() => openAgent('Help me understand and act on my contacts.', 'contacts_overview')}
      secondaryActions={contactsSecondaryActions}
      primaryAction={<CreateContactButton />}
      filterBar={filterBar}
      error={error ? { title: 'Error loading contacts', message: error, onRetry: refetch } : null}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {showFilters && (
        <CrmFilters
          filters={filterComponents}
          onClearAll={handleClearFilters}
          show={showFilters}
        />
      )}

      {contactInsights.length > 0 && (
        <ContactInsightsGrid insights={contactInsights} onOpenAgent={openAgent} />
      )}

      {selectedContacts.length > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedContacts.length}
          onClearSelection={() => setSelectedContacts([])}
          extraActions={
            <RunAutomationMenu
              entityType="contact"
              recordIds={selectedContacts.map((c) => c._id)}
              availability="bulk"
            />
          }
          onAssignOwner={() => {
            toast({ title: 'Assign Owner', description: 'This feature will be available soon.' });
          }}
          onAddTags={() => {
            toast({ title: 'Add Tags', description: 'This feature will be available soon.' });
          }}
          onSendEmail={() => {
            toast({ title: 'Send Email', description: 'This feature will be available soon.' });
          }}
          onDelete={() => {
            if (confirm(`Delete ${selectedContacts.length} contacts?`)) {
              void (async () => {
                try {
                  const deletedCount = await bulkDeleteContacts(
                    selectedContacts.map((contact) => contact._id)
                  );
                  setSelectedContacts([]);
                  toast({
                    title: 'Contacts deleted',
                    description: `${deletedCount} contact(s) deleted successfully.`,
                  });
                  await refetch();
                } catch (error) {
                  toast({
                    variant: 'destructive',
                    title: 'Bulk delete failed',
                    description: error instanceof Error ? error.message : 'Failed to delete contacts.',
                  });
                }
              })();
            }
          }}
        />
      )}

      {layout === 'kanban' ? (
        <RecordKanban<Contact>
          items={contacts}
          groupKey={kanbanGroupKey}
          columns={getKanbanColumns('contact', kanbanGroupKey)}
          getId={(c) => c._id}
          getLabel={(c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact'}
          getSubtitle={(c) => c.email || c.jobTitle || undefined}
          onItemClick={(c) => openRecord(c._id)}
          onMoveItem={
            movableContactFields.has(kanbanGroupKey) ? handleContactMove : undefined
          }
          note={
            pagination && contacts.length < pagination.total
              ? `Showing first ${contacts.length} of ${pagination.total} contacts`
              : undefined
          }
        />
      ) : (
      <div className="rounded-xl border border-border bg-card p-0.5">
        <CrmDataGrid
          className="border-none"
          columns={columns}
          data={contacts}
          loading={loading}
          enableRowSelection
          enableSorting
          onRowSelectionChange={setSelectedContacts}
          getRowId={(row) => row._id}
          groupBy={selectedView?.groupBy ? { key: selectedView.groupBy } : undefined}
          onRowClick={(contact) => openRecord(contact._id)}
          emptyMessage="No contacts found"
          emptyDescription="Get started by creating your first contact"
          mobileCard={(contact) => (
            <Link href={`/crm/contacts/${contact._id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
              <Avatar className="size-10 shrink-0">
                <AvatarImage src={contact.avatar} alt={`${contact.firstName} ${contact.lastName || ''}`} />
                <AvatarFallback className="text-sm font-medium">
                  {contact.firstName?.[0]}{contact.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{contact.firstName} {contact.lastName}</p>
                {contact.email && <p className="truncate text-xs text-muted-foreground">{contact.email}</p>}
              </div>
              {contact.status && (
                <Badge variant="secondary" className="shrink-0 text-xs capitalize">
                  {contact.status}
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
        entityType="contacts"
        availableFields={exportFields}
        filters={filters}
        selectedIds={selectedContacts.map((c) => c._id)}
      />

      <ViewEditor
        open={showSaveViewDialog}
        onOpenChange={setShowSaveViewDialog}
        entityType="contact"
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

      <RecordPreviewPanel
        entityType="contact"
        recordId={previewId}
        open={previewId !== null}
        onOpenChange={(open) => { if (!open) setPreviewId(null); }}
      />
    </ModuleShell>
  );
}
