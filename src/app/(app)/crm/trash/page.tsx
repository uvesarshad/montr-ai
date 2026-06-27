'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { ModuleShell } from '@/components/shell/module-shell';
import { PageHeader, Segmented, Table, EmptyState, Button, ConfirmDialog, type TableColumn } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { Trash2, RotateCcw } from 'lucide-react';

type EntityType = 'contact' | 'company' | 'deal';

interface TrashRow extends Record<string, unknown> {
  id: string;
  label: string;
  deletedAt?: string;
  deletedBy?: string;
}

const ENTITY_OPTIONS: { value: EntityType; label: string }[] = [
  { value: 'contact', label: 'Contacts' },
  { value: 'company', label: 'Companies' },
  { value: 'deal', label: 'Deals' },
];

const API_PATH: Record<EntityType, string> = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
};

interface TrashState {
  rows: TrashRow[];
  loading: boolean;
  error: string | null;
}

type TrashAction =
  | { type: 'load_start' }
  | { type: 'load_success'; rows: TrashRow[] }
  | { type: 'load_error'; error: string }
  | { type: 'set_rows'; rows: TrashRow[] }
  | { type: 'update_rows'; updater: (prev: TrashRow[]) => TrashRow[] };

const initialTrashState: TrashState = {
  rows: [],
  loading: true,
  error: null,
};

function trashReducer(state: TrashState, action: TrashAction): TrashState {
  switch (action.type) {
    case 'load_start':
      return { ...state, loading: true, error: null };
    case 'load_success':
      return { ...state, loading: false, rows: action.rows };
    case 'load_error':
      return { ...state, loading: false, error: action.error };
    case 'set_rows':
      return { ...state, rows: action.rows };
    case 'update_rows':
      return { ...state, rows: action.updater(state.rows) };
    default:
      return state;
  }
}

export default function CrmTrashPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === 'admin' || role === 'super_admin';

  const [entityType, setEntityType] = useState<EntityType>('contact');
  const [{ rows, loading, error }, dispatch] = useReducer(trashReducer, initialTrashState);

  // Confirm-dialog state for "delete forever" / "empty trash".
  const [purgeRow, setPurgeRow] = useState<TrashRow | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const load = useCallback(async () => {
    dispatch({ type: 'load_start' });
    try {
      const res = await fetch(`/api/v2/crm/trash?entityType=${entityType}&limit=100`);
      if (!res.ok) throw new Error('Failed to load trash');
      const json = await res.json();
      dispatch({ type: 'load_success', rows: json.data || [] });
    } catch (e) {
      dispatch({ type: 'load_error', error: e instanceof Error ? e.message : 'Failed to load trash' });
    }
  }, [entityType]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (row: TrashRow) => {
    try {
      const res = await fetch(`/api/v2/crm/${API_PATH[entityType]}/${row.id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('Restore failed');
      toast({ title: 'Restored', description: `${row.label} was restored.` });
      dispatch({ type: 'update_rows', updater: prev => prev.filter(r => r.id !== row.id) });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to restore record.' });
    }
  };

  const handlePurge = async (row: TrashRow) => {
    const res = await fetch(`/api/v2/crm/${API_PATH[entityType]}/${row.id}?permanent=true`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to permanently delete.' });
      throw new Error('Purge failed');
    }
    toast({ title: 'Deleted', description: `${row.label} was permanently deleted.` });
    dispatch({ type: 'update_rows', updater: prev => prev.filter(r => r.id !== row.id) });
  };

  const handleEmptyTrash = async () => {
    const res = await fetch('/api/v2/crm/trash/empty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType }),
    });
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to empty trash.' });
      throw new Error('Empty failed');
    }
    toast({ title: 'Trash emptied', description: 'All trashed records were permanently deleted.' });
    dispatch({ type: 'set_rows', rows: [] });
  };

  const columns: TableColumn<TrashRow>[] = [
    { key: 'label', label: 'Name' },
    {
      key: 'deletedAt',
      label: 'Deleted',
      render: (v) => (v ? new Date(v as string).toLocaleString() : '—'),
    },
    {
      key: 'id',
      label: '',
      align: 'right',
      render: (_v, row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => handleRestore(row)}>
            Restore
          </Button>
          {isAdmin ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setPurgeRow(row)}>
              Delete forever
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ModuleShell title="Trash">
      <div className="flex flex-col gap-4 p-4">
        <PageHeader
          title="Trash"
          sub="Restore deleted records or remove them permanently. Trashed items are purged automatically after 30 days."
          icon={Trash2}
          actions={
            isAdmin ? (
              <Button variant="ghost" icon={Trash2} onClick={() => setEmptyOpen(true)} disabled={rows.length === 0}>
                Empty trash
              </Button>
            ) : undefined
          }
        />

        <Segmented
          options={ENTITY_OPTIONS}
          value={entityType}
          onChange={(v) => setEntityType(v as EntityType)}
        />

        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <EmptyState icon={Trash2} title="Couldn’t load trash" note={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Trash2} title="Trash is empty" note="Deleted records will appear here." />
        ) : (
          <Table columns={columns} rows={rows} rowKey="id" />
        )}
      </div>

      <ConfirmDialog
        open={!!purgeRow}
        onOpenChange={(o) => { if (!o) setPurgeRow(null); }}
        title="Delete forever?"
        description={purgeRow ? `“${purgeRow.label}” will be permanently deleted. This cannot be undone.` : undefined}
        confirmLabel="Delete forever"
        onConfirm={async () => { if (purgeRow) await handlePurge(purgeRow); setPurgeRow(null); }}
      />

      <ConfirmDialog
        open={emptyOpen}
        onOpenChange={setEmptyOpen}
        title="Empty trash?"
        description="All trashed records of this type will be permanently deleted. This cannot be undone."
        confirmLabel="Empty trash"
        onConfirm={handleEmptyTrash}
      />
    </ModuleShell>
  );
}
