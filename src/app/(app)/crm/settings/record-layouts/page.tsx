'use client';

import { useCallback, useEffect, useState } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import { Card, Button, Segmented, Banner, Spinner, IconButton } from '@/components/ui-kit';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { LayoutPanelTop, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import {
  RECORD_LAYOUT_SECTIONS,
  defaultLayoutFor,
  mergeLayout,
  type RecordLayoutEntityType,
  type RecordLayoutColumn,
  type RecordLayoutSection,
} from '@/components/crm/shared/record-layout-sections';

const ENTITY_OPTIONS = [
  { value: 'contact', label: 'Contacts' },
  { value: 'company', label: 'Companies' },
  { value: 'deal', label: 'Deals' },
];

const COLUMN_TITLES: Record<RecordLayoutColumn, string> = {
  main: 'Main column',
  side: 'Sidebar',
};

export default function RecordLayoutsPage() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<RecordLayoutEntityType>('contact');
  const [sections, setSections] = useState<RecordLayoutSection[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const labels = Object.fromEntries(
    RECORD_LAYOUT_SECTIONS[entityType].map((s) => [s.key, s.label])
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/crm/record-layouts?entityType=${entityType}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setSections(mergeLayout(entityType, data.sections));
      setIsDefault(data.isDefault ?? false);
    } catch {
      setSections(defaultLayoutFor(entityType));
      toast({ variant: 'destructive', title: 'Failed to load record layout' });
    } finally {
      setLoading(false);
    }
  }, [entityType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const byColumn = (column: RecordLayoutColumn) =>
    sections
      .filter((s) => s.column === column)
      .sort((a, b) => a.order - b.order);

  const toggleVisible = (key: string) =>
    setSections((prev) =>
      prev.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s))
    );

  // Swap order with the neighbour in the same column.
  const move = (column: RecordLayoutColumn, key: string, dir: -1 | 1) => {
    setSections((prev) => {
      const col = prev
        .filter((s) => s.column === column)
        .sort((a, b) => a.order - b.order);
      const idx = col.findIndex((s) => s.key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= col.length) return prev;
      const a = col[idx];
      const b = col[target];
      return prev.map((s) => {
        if (s.key === a.key) return { ...s, order: b.order };
        if (s.key === b.key) return { ...s, order: a.order };
        return s;
      });
    });
  };

  const resetToDefault = () => {
    setSections(defaultLayoutFor(entityType));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/v2/crm/record-layouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityType, sections }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSections(mergeLayout(entityType, data.sections));
      setIsDefault(false);
      toast({ title: 'Record layout saved' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to save record layout' });
    } finally {
      setSaving(false);
    }
  };

  const renderColumn = (column: RecordLayoutColumn) => {
    const rows = byColumn(column);
    if (rows.length === 0) return null;
    return (
      <Card key={column} title={COLUMN_TITLES[column]}>
        <div className="flex flex-col gap-2">
          {rows.map((s, i) => (
            <div
              key={s.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <Switch checked={s.visible} onCheckedChange={() => toggleVisible(s.key)} />
                <span className={`text-sm ${s.visible ? '' : 'text-muted-foreground line-through'}`}>
                  {labels[s.key] ?? s.key}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  icon={ArrowUp}
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(column, s.key, -1)}
                />
                <IconButton
                  icon={ArrowDown}
                  aria-label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(column, s.key, 1)}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  return (
    <ModuleShell
      title="Record layouts"
      icon={LayoutPanelTop}
      meta="Reorder and hide sections on contact, company, and deal detail pages"
      contentClassName="flex flex-col gap-4 pb-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={ENTITY_OPTIONS}
          value={entityType}
          onChange={(v) => setEntityType(v as RecordLayoutEntityType)}
        />
        <div className="flex items-center gap-2">
          <Button variant="outline" icon={RotateCcw} onClick={resetToDefault} disabled={loading}>
            Reset to default
          </Button>
          <Button variant="brand" onClick={save} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {isDefault && (
        <Banner tone="info">
          Showing the built-in default layout. Saving will store a custom layout for your
          organization.
        </Banner>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {renderColumn('main')}
          {renderColumn('side')}
        </div>
      )}
    </ModuleShell>
  );
}
