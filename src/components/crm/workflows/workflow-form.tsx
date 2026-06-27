'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Workflow } from '@/hooks/crm/use-workflows';
import {
  Button,
  Card,
  Input,
  Textarea,
  Select,
  Field,
  Spinner,
} from '@/components/ui-kit';
import { Plus, Trash2 } from 'lucide-react';

const TRIGGER_TYPES = [
  { value: 'record_created', label: 'Record Created' },
  { value: 'record_updated', label: 'Record Updated' },
  { value: 'field_changed', label: 'Field Changed' },
  { value: 'stage_changed', label: 'Stage Changed' },
  { value: 'deal_won', label: 'Deal Won' },
  { value: 'deal_lost', label: 'Deal Lost' },
  { value: 'tag_added', label: 'Tag Added' },
  { value: 'tag_removed', label: 'Tag Removed' },
  { value: 'manual', label: 'Manual' },
];

const ACTION_TYPES = [
  { value: 'update_field', label: 'Update Field' },
  { value: 'add_tag', label: 'Add Tag' },
  { value: 'remove_tag', label: 'Remove Tag' },
  { value: 'assign_owner', label: 'Assign Owner' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'create_activity', label: 'Create Activity' },
  { value: 'send_email', label: 'Send Email' },
  { value: 'send_webhook', label: 'Send Webhook' },
  { value: 'send_whatsapp', label: 'Send WhatsApp' },
  { value: 'move_stage', label: 'Move Stage' },
  { value: 'wait', label: 'Wait' },
];

interface WorkflowFormProps {
  workflow?: Workflow;
  onSuccess?: (id: string) => void;
}

interface ActionItem {
  type: string;
  config: Record<string, unknown>;
}

export function WorkflowForm({ workflow, onSuccess }: WorkflowFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState(workflow?.name ?? '');
  const [description, setDescription] = useState(workflow?.description ?? '');
  const [isActive, setIsActive] = useState(workflow?.isActive ?? false);
  const [triggerType, setTriggerType] = useState(workflow?.trigger.type ?? 'record_created');
  const [entityType, setEntityType] = useState<'contact' | 'company' | 'deal'>(
    workflow?.trigger.entityType ?? 'contact'
  );
  const [runOnce, setRunOnce] = useState(workflow?.runOnce ?? false);
  const [actions, setActions] = useState<ActionItem[]>(
    workflow?.actions?.map(a => ({ type: a.type, config: a.config })) ?? []
  );

  const addAction = () => setActions(prev => [...prev, { type: 'update_field', config: {} }]);
  const removeAction = (index: number) => setActions(prev => prev.filter((_, i) => i !== index));
  const updateActionType = (index: number, type: string) =>
    setActions(prev => prev.map((a, i) => (i === index ? { ...a, type } : a)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ variant: 'destructive', title: 'Name is required' });
      return;
    }
    if (actions.length === 0) {
      toast({ variant: 'destructive', title: 'Add at least one action' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive,
        trigger: { type: triggerType, entityType, config: {} },
        conditions: [],
        actions,
        runOnce,
      };

      const url = workflow ? `/api/v2/crm/workflows/${workflow._id}` : '/api/v2/crm/workflows';
      const method = workflow ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save workflow');
      }

      const data = await res.json();
      toast({ title: workflow ? 'Workflow updated' : 'Workflow created' });
      onSuccess?.(data.data._id ?? workflow?._id ?? '');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save workflow',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card title="Basic Info">
        <div className="space-y-4 px-4 pb-4">
          <Field label="Name" required htmlFor="name">
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Assign owner on contact create"
            />
          </Field>
          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this workflow do?"
              rows={2}
            />
          </Field>
          <div className="flex items-center justify-between">
            <label htmlFor="active" className="text-sm font-medium">Active</label>
            <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Run once per record</p>
              <p className="text-xs text-muted-foreground">Only trigger once per entity, even if conditions are met multiple times</p>
            </div>
            <Switch id="runonce" checked={runOnce} onCheckedChange={setRunOnce} />
          </div>
        </div>
      </Card>

      <Card title="Trigger">
        <div className="grid grid-cols-2 gap-4 px-4 pb-4">
          <Field label="Entity Type">
            <Select
              options={[
                { value: 'contact', label: 'Contact' },
                { value: 'company', label: 'Company' },
                { value: 'deal', label: 'Deal' },
              ]}
              value={entityType}
              onChange={v => setEntityType(v as 'contact' | 'company' | 'deal')}
            />
          </Field>
          <Field label="Trigger When">
            <Select
              options={TRIGGER_TYPES}
              value={triggerType}
              onChange={setTriggerType}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Actions"
        action={
          <Button type="button" variant="outline" size="sm" icon={Plus} onClick={addAction}>
            Add Action
          </Button>
        }
      >
        <div className="space-y-3 px-4 pb-4">
          {actions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No actions yet. Add an action to define what happens when this workflow triggers.
            </p>
          )}
          {actions.map((action, index) => (
            <div key={`${action.type}-${index}`} className="flex items-center gap-2 p-3 bg-muted/40 rounded-xl border border-border/60">
              <span className="text-xs text-muted-foreground w-5 text-center">{index + 1}</span>
              <div className="flex-1">
                <Select
                  options={ACTION_TYPES}
                  value={action.type}
                  onChange={v => updateActionType(index, v)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Trash2}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeAction(index)}
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting && <Spinner size={14} />}
          {workflow ? 'Save Changes' : 'Create Workflow'}
        </Button>
      </div>
    </form>
  );
}
