'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import {
  Card,
  Button,
  Banner,
  Spinner,
  Chip,
  Table,
  Field,
  Select,
  FormDialog,
  Textarea,
} from '@/components/ui-kit';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, Plus, Lock } from 'lucide-react';

type Scope = 'all' | 'own' | 'none';
type Entity = 'contact' | 'company' | 'deal' | 'activity';

interface ObjectPermission {
  read: Scope;
  create: boolean;
  update: Scope;
  delete: Scope;
  export: boolean;
}
type Permissions = Record<Entity, ObjectPermission>;

interface Role {
  _id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  canManageSettings: boolean;
  permissions: Permissions;
}

interface Member {
  id: string;
  name: string;
  email: string | null;
  crmRoleId: string | null;
}

const ENTITIES: { key: Entity; label: string }[] = [
  { key: 'contact', label: 'Contacts' },
  { key: 'company', label: 'Companies' },
  { key: 'deal', label: 'Deals' },
  { key: 'activity', label: 'Activities' },
];

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'own', label: 'Own' },
  { value: 'none', label: 'None' },
];

function emptyPermissions(): Permissions {
  const p: ObjectPermission = { read: 'none', create: false, update: 'none', delete: 'none', export: false };
  return { contact: { ...p }, company: { ...p }, deal: { ...p }, activity: { ...p } };
}

function PermissionMatrix({
  permissions,
  isAdminRole,
  updatePerm,
}: {
  permissions: Permissions;
  isAdminRole: boolean;
  updatePerm: (entity: Entity, patch: Partial<ObjectPermission>) => void;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-2 py-2">Object</th>
            <th className="px-2 py-2">Read</th>
            <th className="px-2 py-2">Create</th>
            <th className="px-2 py-2">Update</th>
            <th className="px-2 py-2">Delete</th>
            <th className="px-2 py-2">Export</th>
          </tr>
        </thead>
        <tbody>
          {ENTITIES.map(({ key, label }) => {
            const p = permissions[key];
            const ro = Boolean(isAdminRole);
            return (
              <tr key={key} className="border-t border-border">
                <td className="px-2 py-2 font-medium">{label}</td>
                <td className="px-2 py-2">
                  <Select
                    options={SCOPE_OPTIONS}
                    value={p.read}
                    onChange={(v) => updatePerm(key, { read: v as Scope })}
                    disabled={ro}
                  />
                </td>
                <td className="px-2 py-2">
                  <Switch
                    checked={p.create}
                    onCheckedChange={(c) => updatePerm(key, { create: c })}
                    disabled={ro}
                  />
                </td>
                <td className="px-2 py-2">
                  <Select
                    options={SCOPE_OPTIONS}
                    value={p.update}
                    onChange={(v) => updatePerm(key, { update: v as Scope })}
                    disabled={ro}
                  />
                </td>
                <td className="px-2 py-2">
                  <Select
                    options={SCOPE_OPTIONS}
                    value={p.delete}
                    onChange={(v) => updatePerm(key, { delete: v as Scope })}
                    disabled={ro}
                  />
                </td>
                <td className="px-2 py-2">
                  <Switch
                    checked={p.export}
                    onCheckedChange={(c) => updatePerm(key, { export: c })}
                    disabled={ro}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function CrmRolesPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);

  // Create-role dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, mRes] = await Promise.all([
        fetch('/api/v2/crm/roles', { credentials: 'include' }),
        fetch('/api/v2/crm/members', { credentials: 'include' }),
      ]);
      if (rRes.status === 403) {
        setDenied(true);
        return;
      }
      const rData = await rRes.json();
      const mData = mRes.ok ? await mRes.json() : { members: [] };
      const list: Role[] = rData.roles ?? [];
      setRoles(list);
      setMembers(mData.members ?? []);
      setSelectedId((prev) => prev ?? list[0]?._id ?? null);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load roles' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => roles.find((r) => r._id === selectedId) ?? null, [roles, selectedId]);

  // Sync draft when selection changes.
  useEffect(() => {
    setDraft(selected ? JSON.parse(JSON.stringify(selected)) : null);
  }, [selected]);

  const isAdminRole = draft?.isSystem && draft?.name === 'Admin';

  const updatePerm = (entity: Entity, patch: Partial<ObjectPermission>) => {
    setDraft((d) =>
      d ? { ...d, permissions: { ...d.permissions, [entity]: { ...d.permissions[entity], ...patch } } } : d
    );
  };

  const saveRole = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v2/crm/roles/${draft._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          permissions: draft.permissions,
          canManageSettings: draft.canManageSettings,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }
      toast({ title: 'Role saved' });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: e instanceof Error ? e.message : 'Failed to save role' });
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    const res = await fetch('/api/v2/crm/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        permissions: emptyPermissions(),
        canManageSettings: false,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Create failed');
    }
    const created: Role = await res.json();
    setNewName('');
    setNewDesc('');
    await load();
    setSelectedId(created._id);
    toast({ title: 'Role created' });
  };

  const deleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? Members keep CRM access with legacy (full) permissions.`)) return;
    const res = await fetch(`/api/v2/crm/roles/${role._id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Failed to delete role' });
      return;
    }
    setSelectedId(null);
    await load();
    toast({ title: 'Role deleted' });
  };

  const assignMember = async (userId: string, roleId: string) => {
    const res = await fetch('/api/v2/crm/roles/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId, roleId: roleId || null }),
    });
    if (!res.ok) {
      toast({ variant: 'destructive', title: 'Failed to assign role' });
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, crmRoleId: roleId || null } : m)));
    toast({ title: 'Role assignment updated' });
  };

  if (loading) {
    return (
      <ModuleShell title="Roles & permissions" icon={KeyRound} meta="CRM access control">
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </ModuleShell>
    );
  }

  if (denied) {
    return (
      <ModuleShell title="Roles & permissions" icon={KeyRound} meta="CRM access control">
        <Banner tone="warn">
          You don&apos;t have permission to manage CRM roles. Ask an administrator for the
          &quot;Manage settings&quot; permission.
        </Banner>
      </ModuleShell>
    );
  }

  const roleOptions = [
    { value: '', label: 'No role (full access)' },
    ...roles.map((r) => ({ value: r._id, label: r.name })),
  ];

  return (
    <ModuleShell
      title="Roles & permissions"
      icon={KeyRound}
      meta="Define org-scoped CRM roles and assign them to members"
      contentClassName="flex flex-col gap-4 pb-8"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Roles list */}
        <Card
          title="Roles"
          action={
            <Button size="sm" variant="brand" icon={Plus} onClick={() => setCreateOpen(true)}>
              New
            </Button>
          }
        >
          <div className="flex flex-col gap-1.5">
            {roles.map((r) => (
              <button
                key={r._id}
                type="button"
                onClick={() => setSelectedId(r._id)}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${
                  r._id === selectedId
                    ? 'border-brand bg-brand/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {r.isSystem ? <Lock className="size-3.5 text-muted-foreground" /> : null}
                  <span className="truncate">{r.name}</span>
                </span>
                {r.isSystem ? <Chip>System</Chip> : null}
              </button>
            ))}
          </div>
        </Card>

        {/* Permission matrix editor */}
        {draft ? (
          <Card
            title={`${draft.name} permissions`}
            action={
              <div className="flex items-center gap-2">
                {!draft.isSystem ? (
                  <Button size="sm" variant="ghost" onClick={() => deleteRole(draft)}>
                    Delete
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="brand"
                  onClick={saveRole}
                  disabled={saving || isAdminRole}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            }
          >
            {isAdminRole ? (
              <Banner tone="info">The Admin role grants full access and cannot be modified.</Banner>
            ) : null}

            <PermissionMatrix
              permissions={draft.permissions}
              isAdminRole={Boolean(isAdminRole)}
              updatePerm={updatePerm}
            />

            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Manage CRM settings</div>
                <div className="text-xs text-muted-foreground">
                  Pipelines, custom fields, dedupe, layouts, webhooks, roles.
                </div>
              </div>
              <Switch
                checked={draft.canManageSettings}
                onCheckedChange={(c) => setDraft((d) => (d ? { ...d, canManageSettings: c } : d))}
                disabled={Boolean(isAdminRole)}
              />
            </div>
          </Card>
        ) : (
          <Card title="Permissions">
            <div className="py-8 text-center text-sm text-muted-foreground">Select a role to edit.</div>
          </Card>
        )}
      </div>

      {/* Member assignment */}
      <Card title="Members">
        <Table<Member & Record<string, unknown>>
          rowKey="id"
          rows={members as (Member & Record<string, unknown>)[]}
          columns={[
            { key: 'name', label: 'Member' },
            {
              key: 'email',
              label: 'Email',
              render: (v) => <span className="text-muted-foreground">{(v as string) ?? '—'}</span>,
            },
            {
              key: 'crmRoleId',
              label: 'Role',
              width: 240,
              render: (_v, row) => (
                <div className="max-w-[220px]">
                  <Select
                    options={roleOptions}
                    value={(row.crmRoleId as string | null) ?? ''}
                    onChange={(v) => assignMember(row.id as string, v)}
                  />
                </div>
              ),
            },
          ]}
        />
        {members.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No members found.</div>
        ) : null}
      </Card>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create role"
        description="New roles start with no permissions. Configure them after creating."
        submitLabel="Create"
        onSubmit={createRole}
      >
        <Field label="Name" required htmlFor="role-name">
          <Input
            id="role-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Sales rep"
          />
        </Field>
        <Field label="Description" htmlFor="role-desc">
          <Textarea
            id="role-desc"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </FormDialog>
    </ModuleShell>
  );
}
