'use client';

import { useReducer, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CustomField, CustomFieldType } from '@/types/crm';
import { Loader2, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'select', label: 'Select (single)' },
  { value: 'multiselect', label: 'Select (multiple)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
];

interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

interface CustomFieldFormProps {
  entityType: 'contact' | 'company' | 'deal';
  field?: CustomField;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FieldFormState {
  fieldLabel: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  required: boolean;
  showInList: boolean;
  showInCreate: boolean;
  showInFilters: boolean;
  options: FieldOption[];
}

type FieldFormAction =
  | { type: 'setLabel'; value: string; autoKey?: string }
  | { type: 'setKey'; value: string }
  | { type: 'setType'; value: CustomFieldType }
  | { type: 'setRequired'; value: boolean }
  | { type: 'setShowInList'; value: boolean }
  | { type: 'setShowInCreate'; value: boolean }
  | { type: 'setShowInFilters'; value: boolean }
  | { type: 'addOption'; option: FieldOption }
  | { type: 'removeOption'; index: number };

function fieldFormReducer(state: FieldFormState, action: FieldFormAction): FieldFormState {
  switch (action.type) {
    case 'setLabel':
      return action.autoKey !== undefined
        ? { ...state, fieldLabel: action.value, fieldKey: action.autoKey }
        : { ...state, fieldLabel: action.value };
    case 'setKey':
      return { ...state, fieldKey: action.value };
    case 'setType':
      return { ...state, fieldType: action.value };
    case 'setRequired':
      return { ...state, required: action.value };
    case 'setShowInList':
      return { ...state, showInList: action.value };
    case 'setShowInCreate':
      return { ...state, showInCreate: action.value };
    case 'setShowInFilters':
      return { ...state, showInFilters: action.value };
    case 'addOption':
      return { ...state, options: [...state.options, action.option] };
    case 'removeOption':
      return { ...state, options: state.options.filter((_, i) => i !== action.index) };
    default:
      return state;
  }
}

export function CustomFieldForm({ entityType, field, onSuccess, onCancel }: CustomFieldFormProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const [form, dispatch] = useReducer(fieldFormReducer, undefined, (): FieldFormState => ({
    fieldLabel: field?.fieldLabel ?? '',
    fieldKey: field?.fieldKey ?? '',
    fieldType: field?.fieldType ?? 'text',
    required: field?.required ?? false,
    showInList: field?.showInList ?? false,
    showInCreate: field?.showInCreate ?? true,
    showInFilters: field?.showInFilters ?? false,
    options: field?.options ?? [],
  }));
  const { fieldLabel, fieldKey, fieldType, required, showInList, showInCreate, showInFilters, options } = form;
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const isEditing = !!field;
  const needsOptions = fieldType === 'select' || fieldType === 'multiselect';

  const autoKey = (label: string) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const handleLabelChange = (value: string) => {
    dispatch({ type: 'setLabel', value, autoKey: isEditing ? undefined : autoKey(value) });
  };

  const addOption = () => {
    if (!newOptionLabel.trim()) return;
    const val = autoKey(newOptionLabel);
    dispatch({ type: 'addOption', option: { value: val, label: newOptionLabel.trim() } });
    setNewOptionLabel('');
  };

  const removeOption = (index: number) => dispatch({ type: 'removeOption', index });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldLabel.trim()) {
      toast({ variant: 'destructive', title: 'Field label is required' });
      return;
    }
    if (!isEditing && !fieldKey.trim()) {
      toast({ variant: 'destructive', title: 'Field key is required' });
      return;
    }
    if (needsOptions && options.length === 0) {
      toast({ variant: 'destructive', title: 'Add at least one option for select fields' });
      return;
    }

    setSubmitting(true);
    try {
      const payload = isEditing
        ? { fieldLabel, fieldType, options: needsOptions ? options : [], required, showInList, showInCreate, showInFilters }
        : { entityType, fieldKey, fieldLabel, fieldType, options: needsOptions ? options : [], required, showInList, showInCreate, showInFilters };

      const url = isEditing ? `/api/v2/crm/custom-fields/${field._id}` : '/api/v2/crm/custom-fields';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save field');
      }

      toast({ title: isEditing ? 'Field updated' : 'Field created' });
      onSuccess();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save field',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="fieldLabel">Label *</Label>
        <Input
          id="fieldLabel"
          value={fieldLabel}
          onChange={e => handleLabelChange(e.target.value)}
          placeholder="e.g. LinkedIn URL"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fieldKey">Field Key *</Label>
        <Input
          id="fieldKey"
          value={fieldKey}
          onChange={e => dispatch({ type: 'setKey', value: autoKey(e.target.value) })}
          placeholder="e.g. linkedin_url"
          disabled={isEditing}
          required
        />
        <p className="text-xs text-muted-foreground">Alphanumeric and underscores only. Cannot be changed after creation.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Field Type</Label>
        <Select value={fieldType} onValueChange={v => dispatch({ type: 'setType', value: v as CustomFieldType })} disabled={isEditing}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEditing && <p className="text-xs text-muted-foreground">Field type cannot be changed after creation.</p>}
      </div>

      {needsOptions && (
        <div className="space-y-2">
          <Label>Options</Label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {options.map((opt, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {opt.label}
                <button type="button" onClick={() => removeOption(i)} className="hover:text-destructive">×</button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Option label"
              value={newOptionLabel}
              onChange={e => setNewOptionLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
            />
            <Button type="button" variant="outline" size="sm" onClick={addOption}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="required">Required</Label>
          <Switch id="required" checked={required} onCheckedChange={v => dispatch({ type: 'setRequired', value: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showInList">Show in list view</Label>
          <Switch id="showInList" checked={showInList} onCheckedChange={v => dispatch({ type: 'setShowInList', value: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showInCreate">Show in create form</Label>
          <Switch id="showInCreate" checked={showInCreate} onCheckedChange={v => dispatch({ type: 'setShowInCreate', value: v })} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="showInFilters">Show in filters</Label>
          <Switch id="showInFilters" checked={showInFilters} onCheckedChange={v => dispatch({ type: 'setShowInFilters', value: v })} />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="size-4 mr-2 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Field'}
        </Button>
      </div>
    </form>
  );
}
