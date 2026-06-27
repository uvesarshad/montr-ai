'use client';

import { useCallback, useEffect, useState } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import { Card, Button, Segmented, Chip, Banner, Spinner } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';

type EntityType = 'contact' | 'company' | 'deal';

interface Criterion {
  fields: string[];
}

// Common matchable fields per entity (custom fields can be typed but these
// cover the defaults). Each criterion is an AND of the chosen fields.
const FIELD_OPTIONS: Record<EntityType, { value: string; label: string }[]> = {
  contact: [
    { value: 'email', label: 'Email' },
    { value: 'phoneNormalized', label: 'Phone' },
    { value: 'firstName', label: 'First name' },
    { value: 'lastName', label: 'Last name' },
    { value: 'companyId', label: 'Company' },
  ],
  company: [
    { value: 'domain', label: 'Domain' },
    { value: 'name', label: 'Name' },
    { value: 'website', label: 'Website' },
  ],
  deal: [
    { value: 'name', label: 'Name' },
    { value: 'pipelineId', label: 'Pipeline' },
    { value: 'companyId', label: 'Company' },
  ],
};

const ENTITY_OPTIONS = [
  { value: 'contact', label: 'Contacts' },
  { value: 'company', label: 'Companies' },
  { value: 'deal', label: 'Deals' },
];

export default function DedupeRulesPage() {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<EntityType>('contact');
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/crm/dedupe-rules?entityType=${entityType}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setCriteria((data.criteria || []).map((c: Criterion) => ({ fields: c.fields || [] })));
      setIsActive(data.isActive ?? true);
      setIsDefault(data.isDefault ?? false);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to load dedupe rules' });
    } finally {
      setLoading(false);
    }
  }, [entityType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleField = (idx: number, field: string) => {
    setCriteria((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const has = c.fields.includes(field);
        return { fields: has ? c.fields.filter((f) => f !== field) : [...c.fields, field] };
      }),
    );
  };

  const addCriterion = () => setCriteria((p) => [...p, { fields: [] }]);
  const removeCriterion = (idx: number) =>
    setCriteria((p) => p.filter((_, i) => i !== idx));

  const save = async () => {
    const cleaned = criteria.filter((c) => c.fields.length > 0);
    setSaving(true);
    try {
      const res = await fetch('/api/v2/crm/dedupe-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ entityType, criteria: cleaned, isActive }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIsDefault(data.isDefault ?? false);
      toast({ title: 'Dedupe rules saved' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to save dedupe rules' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleShell
      title="Dedupe rules"
      icon={ShieldCheck}
      meta="Decide when new or imported records count as duplicates"
      contentClassName="flex flex-col gap-4 pb-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={ENTITY_OPTIONS}
          value={entityType}
          onChange={(v) => setEntityType(v as EntityType)}
        />
        <Button variant="brand" onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {isDefault && (
        <Banner tone="info">
          Showing the built-in default rules. Saving will store a custom rule set for your
          organization.
        </Banner>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <Card
          title="Match criteria"
          meta="Each row is an AND of fields; a record is a duplicate if it matches ANY row."
        >
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Duplicate detection active for {entityType}s
          </label>

          <div className="flex flex-col gap-3">
            {criteria.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No criteria — duplicate detection is effectively off for this entity.
              </p>
            )}
            {criteria.map((c, idx) => (
              <div
                key={c.fields.join(',') || `criterion-${idx}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap gap-2">
                  {FIELD_OPTIONS[entityType].map((opt) => (
                    <Chip
                      key={opt.value}
                      selected={c.fields.includes(opt.value)}
                      onClick={() => toggleField(idx, opt.value)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={() => removeCriterion(idx)}
                  aria-label="Remove criterion"
                />
              </div>
            ))}
          </div>

          <div className="mt-4">
            <Button variant="outline" size="sm" icon={Plus} onClick={addCriterion}>
              Add criterion
            </Button>
          </div>
        </Card>
      )}
    </ModuleShell>
  );
}
