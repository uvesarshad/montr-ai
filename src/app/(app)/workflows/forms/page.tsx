'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Inbox } from 'lucide-react';
import { toast } from 'sonner';

import { useAppHeader } from '@/components/app-header';
import {
  Button,
  Input,
  Table,
  EmptyState,
  Skeleton,
  FormDialog,
  Field,
  Textarea,
  Select,
} from '@/components/ui-kit';

type FieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';

interface FormFieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

interface PendingForm {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldDef[];
  workflowId: string;
  status: string;
  createdAt: string;
}

export default function WorkflowFormsPage() {
  const { setHeaderInfo } = useAppHeader();
  const [forms, setForms] = useState<PendingForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PendingForm | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    setHeaderInfo({
      type: 'page',
      title: 'Pending forms',
      description: 'Workflow steps waiting on your input',
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v2/workflow-forms');
      const data = await res.json();
      setForms(Array.isArray(data.forms) ? data.forms : []);
    } catch {
      toast.error('Failed to load forms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (form: PendingForm) => {
    const initial: Record<string, unknown> = {};
    for (const f of form.fields) initial[f.key] = f.type === 'checkbox' ? false : '';
    setValues(initial);
    setActive(form);
  };

  const submit = async () => {
    if (!active) return;
    const res = await fetch(`/api/v2/workflow-forms/${active.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Submission failed');
      throw new Error(err.error || 'Submission failed');
    }
    toast.success('Form submitted — workflow resumed');
    setActive(null);
    await load();
  };

  const setValue = (key: string, v: unknown) => setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="space-y-4 p-6">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : forms.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No pending forms"
          note="When a workflow needs your input, it will show up here."
        />
      ) : (
        <Table<PendingForm & Record<string, unknown>>
          rowKey="id"
          rows={forms as (PendingForm & Record<string, unknown>)[]}
          columns={[
            { key: 'title', label: 'Form' },
            {
              key: 'fields',
              label: 'Fields',
              render: (_v, row) => `${row.fields.length} field${row.fields.length === 1 ? '' : 's'}`,
            },
            {
              key: 'createdAt',
              label: 'Requested',
              render: (_v, row) => new Date(row.createdAt).toLocaleString(),
            },
            {
              key: 'id',
              label: '',
              align: 'right',
              render: (_v, row) => (
                <Button size="sm" variant="brand" icon={ClipboardList} onClick={() => openForm(row)}>
                  Fill out
                </Button>
              ),
            },
          ]}
        />
      )}

      {active ? (
        <FormDialog
          open={!!active}
          onOpenChange={(o) => !o && setActive(null)}
          title={active.title}
          description={active.description}
          icon={ClipboardList}
          submitLabel="Submit"
          onSubmit={submit}
        >
          {active.fields.map((f) => (
            <Field key={f.key} label={f.label} required={f.required} htmlFor={`field-${f.key}`}>
              {f.type === 'textarea' ? (
                <Textarea
                  id={`field-${f.key}`}
                  placeholder={f.placeholder}
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
              ) : f.type === 'select' ? (
                <Select
                  options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                  value={(values[f.key] as string) ?? ''}
                  onChange={(v) => setValue(f.key, v)}
                  placeholder={f.placeholder ?? 'Select…'}
                />
              ) : f.type === 'checkbox' ? (
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    id={`field-${f.key}`}
                    type="checkbox"
                    checked={!!values[f.key]}
                    onChange={(e) => setValue(f.key, e.target.checked)}
                    className="size-4 rounded border-input"
                  />
                  {f.placeholder ?? 'Yes'}
                </label>
              ) : (
                <Input
                  id={`field-${f.key}`}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  placeholder={f.placeholder}
                  value={(values[f.key] as string) ?? ''}
                  onChange={(e) => setValue(f.key, e.target.value)}
                />
              )}
            </Field>
          ))}
        </FormDialog>
      ) : null}
    </div>
  );
}
