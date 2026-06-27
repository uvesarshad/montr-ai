'use client';

/**
 * Org / Brand Variables settings (H8)
 *
 * Reusable key/value strings scoped to the organization, with an optional
 * brand-level override. Surfaced in workflow expressions under the `vars`
 * namespace, e.g. `{{vars.senderName}}` — the concrete realization of
 * `VariableScope.GLOBAL`. n8n equivalent: `$vars`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Variable, Plus, Pencil, Trash2 } from 'lucide-react';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Input,
  Textarea,
  Select,
  Table,
  Skeleton,
  IconButton,
  FormDialog,
  ConfirmDialog,
  type TableColumn,
} from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';

interface OrgVariable {
  _id: string;
  key: string;
  value: string;
  brandId?: string | null;
  description?: string | null;
}

interface BrandOption {
  _id: string;
  name: string;
}

const KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Radix Select disallows empty-string item values, so the org-level (no brand)
// option uses a sentinel and maps back to null/'' on read.
const ORG_SCOPE = '__org__';

const emptyForm = { key: '', value: '', brandId: ORG_SCOPE, description: '' };

export function OrgVariablesView() {
  const { toast } = useToast();

  const [variables, setVariables] = useState<OrgVariable[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<OrgVariable | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [deleteTarget, setDeleteTarget] = useState<OrgVariable | null>(null);

  const brandName = useCallback(
    (id?: string | null) => brands.find((b) => b._id === id)?.name,
    [brands]
  );

  const fetchVariables = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/v2/org-variables');
      if (!res.ok) throw new Error('Failed to load variables');
      const data = await res.json();
      setVariables(data.variables || []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load variables.' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchVariables();
    fetch('/api/social/brands')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: BrandOption[]) => setBrands(data || []))
      .catch(() => {});
  }, [fetchVariables]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (v: OrgVariable) => {
    setEditing(v);
    setForm({
      key: v.key,
      value: v.value ?? '',
      brandId: v.brandId ?? ORG_SCOPE,
      description: v.description ?? '',
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async () => {
    const key = form.key.trim();
    if (!KEY_RE.test(key)) {
      toast({
        variant: 'destructive',
        title: 'Invalid key',
        description: 'Key must start with a letter/underscore and contain only letters, numbers, and underscores.',
      });
      throw new Error('invalid key');
    }

    const payload = {
      key,
      value: form.value,
      brandId: form.brandId === ORG_SCOPE ? null : form.brandId || null,
      description: form.description || null,
    };

    const res = await fetch(
      editing ? `/api/v2/org-variables/${editing._id}` : '/api/v2/org-variables',
      {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.error || 'Failed to save variable.',
      });
      throw new Error('save failed');
    }

    toast({ title: editing ? 'Variable updated' : 'Variable created' });
    await fetchVariables();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/v2/org-variables/${deleteTarget._id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete variable.' });
      throw new Error('delete failed');
    }
    toast({ title: 'Variable deleted' });
    setDeleteTarget(null);
    await fetchVariables();
  };

  const brandOptions = [
    { value: ORG_SCOPE, label: 'Organization (all brands)' },
    ...brands.map((b) => ({ value: b._id, label: b.name })),
  ];

  const columns: TableColumn<OrgVariable & Record<string, unknown>>[] = [
    {
      key: 'key',
      label: 'Reference',
      render: (_v, row) => (
        <code className="rounded bg-muted px-1.5 py-0.5 text-[12px]">{`{{vars.${row.key}}}`}</code>
      ),
    },
    {
      key: 'value',
      label: 'Value',
      render: (_v, row) => (
        <span className="line-clamp-1 max-w-[280px] text-muted-foreground">{row.value || '—'}</span>
      ),
    },
    {
      key: 'brandId',
      label: 'Scope',
      render: (_v, row) =>
        row.brandId ? (
          <Chip tone="brand">{brandName(row.brandId) || 'Brand'}</Chip>
        ) : (
          <Chip tone="gray">Organization</Chip>
        ),
    },
    {
      key: '_id',
      label: '',
      align: 'right',
      width: 88,
      render: (_v, row) => (
        <div className="flex justify-end gap-1">
          <IconButton icon={Pencil} aria-label="Edit" onClick={() => openEdit(row)} />
          <IconButton icon={Trash2} aria-label="Delete" onClick={() => setDeleteTarget(row)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-[13px] font-semibold flex items-center gap-2">
          <Variable className="size-4" /> Variables
        </h3>
        <p className="text-[12px] text-muted-foreground">
          Reusable values for your automations. Reference them in workflow nodes as{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{'{{vars.key}}'}</code>. Brand-scoped
          values override the organization value when a workflow runs for that brand.
        </p>
      </div>

      <Card
        icon={Variable}
        title="Organization variables"
        action={
          <Button variant="brand" size="sm" icon={Plus} onClick={openCreate}>
            New variable
          </Button>
        }
        bodyClassName="p-0"
      >
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : variables.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Variable}
              title="No variables yet"
              note="Create a variable to reuse sender names, URLs, or UTM defaults across all your automations."
              cta={
                <Button variant="brand" size="sm" icon={Plus} onClick={openCreate}>
                  New variable
                </Button>
              }
            />
          </div>
        ) : (
          <Table
            columns={columns}
            rows={variables as (OrgVariable & Record<string, unknown>)[]}
            rowKey="_id"
          />
        )}
      </Card>

      <FormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        icon={Variable}
        title={editing ? 'Edit variable' : 'New variable'}
        description="Reference this variable in automations as {{vars.key}}."
        submitLabel={editing ? 'Save' : 'Create'}
        onSubmit={handleSubmit}
        submitDisabled={!form.key.trim()}
      >
        <div className="space-y-4">
          <Field label="Key" htmlFor="var-key" hint="Letters, numbers and underscores only.">
            <Input
              id="var-key"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
              placeholder="senderName"
            />
          </Field>
          <Field label="Value" htmlFor="var-value">
            <Textarea
              id="var-value"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="Acme Support"
              rows={2}
            />
          </Field>
          <Field label="Scope" htmlFor="var-brand" hint="Brand-scoped values override the organization value.">
            <Select
              options={brandOptions}
              value={form.brandId}
              onChange={(value) => setForm({ ...form, brandId: value })}
              aria-label="Variable scope"
            />
          </Field>
          <Field label="Description" htmlFor="var-desc">
            <Input
              id="var-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional note"
            />
          </Field>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete variable"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.key}"? Automations referencing {{vars.${deleteTarget.key}}} will resolve to an empty value.`
            : ''
        }
        onConfirm={handleDelete}
      />
    </div>
  );
}
