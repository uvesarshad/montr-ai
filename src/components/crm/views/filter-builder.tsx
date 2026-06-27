'use client';

import { X, Plus, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ViewEntityType, FilterOperator } from '@/types/crm';
import { Segmented } from '@/components/ui-kit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FilterTree, FilterRule } from '@/lib/crm/filter-query';

const MAX_DEPTH = 3;

interface FilterBuilderProps {
  entityType: ViewEntityType;
  /** Root group of the nested AND/OR filter tree. */
  tree: FilterTree;
  onChange: (tree: FilterTree) => void;
}

// Field definitions per entity type
const FIELD_DEFINITIONS: Record<ViewEntityType, { value: string; label: string; type: string }[]> = {
  contact: [
    { value: 'firstName', label: 'First Name', type: 'text' },
    { value: 'lastName', label: 'Last Name', type: 'text' },
    { value: 'email', label: 'Email', type: 'text' },
    { value: 'phone', label: 'Phone', type: 'text' },
    { value: 'status', label: 'Status', type: 'select' },
    { value: 'lifecycle', label: 'Lifecycle Stage', type: 'select' },
    { value: 'rating', label: 'Rating', type: 'select' },
    { value: 'score', label: 'Score', type: 'number' },
    { value: 'jobTitle', label: 'Job Title', type: 'text' },
    { value: 'source', label: 'Source', type: 'select' },
    { value: 'createdAt', label: 'Created Date', type: 'date' },
    { value: 'lastActivityAt', label: 'Last Activity', type: 'date' },
  ],
  company: [
    { value: 'name', label: 'Company Name', type: 'text' },
    { value: 'domain', label: 'Domain', type: 'text' },
    { value: 'industry', label: 'Industry', type: 'text' },
    { value: 'type', label: 'Type', type: 'select' },
    { value: 'size', label: 'Company Size', type: 'select' },
    { value: 'annualRevenue', label: 'Annual Revenue', type: 'number' },
    { value: 'employeeCount', label: 'Employee Count', type: 'number' },
    { value: 'createdAt', label: 'Created Date', type: 'date' },
  ],
  deal: [
    { value: 'name', label: 'Deal Name', type: 'text' },
    { value: 'value', label: 'Deal Value', type: 'number' },
    { value: 'status', label: 'Status', type: 'select' },
    { value: 'priority', label: 'Priority', type: 'select' },
    { value: 'probability', label: 'Probability', type: 'number' },
    { value: 'expectedCloseDate', label: 'Expected Close Date', type: 'date' },
    { value: 'createdAt', label: 'Created Date', type: 'date' },
  ],
  activity: [
    { value: 'type', label: 'Activity Type', type: 'select' },
    { value: 'title', label: 'Title', type: 'text' },
    { value: 'status', label: 'Status', type: 'select' },
    { value: 'priority', label: 'Priority', type: 'select' },
    { value: 'dueDate', label: 'Due Date', type: 'date' },
    { value: 'createdAt', label: 'Created Date', type: 'date' },
  ],
};

// Operator definitions per field type
const OPERATOR_DEFINITIONS: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    { value: 'gt', label: 'greater than' },
    { value: 'gte', label: 'greater than or equal' },
    { value: 'lt', label: 'less than' },
    { value: 'lte', label: 'less than or equal' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: 'equals', label: 'is on' },
    { value: 'gt', label: 'is after' },
    { value: 'gte', label: 'is on or after' },
    { value: 'lt', label: 'is before' },
    { value: 'lte', label: 'is on or before' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  select: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'in', label: 'is any of' },
    { value: 'not_in', label: 'is none of' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
};

// ---- Pure tree helpers (exported for testing) ----

function getFieldsFor(entityType: ViewEntityType) {
  return FIELD_DEFINITIONS[entityType] || [];
}

function newRule(entityType: ViewEntityType): FilterRule {
  const fields = getFieldsFor(entityType);
  return { field: fields[0]?.value || '', operator: 'equals', value: '' };
}

function emptyGroup(): FilterTree {
  return { logic: 'and', rules: [], groups: [] };
}

/**
 * Recursive group editor. The root group renders without its own border so it
 * reads as "the filter list"; nested groups render in a bordered box.
 */
interface GroupEditorProps {
  entityType: ViewEntityType;
  group: FilterTree;
  depth: number;
  isRoot?: boolean;
  onChange: (group: FilterTree) => void;
  onRemove?: () => void;
}

function GroupEditor({
  entityType,
  group,
  depth,
  isRoot,
  onChange,
  onRemove,
}: GroupEditorProps) {
  const fields = getFieldsFor(entityType);

  const getFieldType = (fieldValue: string): string =>
    fields.find((f) => f.value === fieldValue)?.type || 'text';

  const getOperatorsForField = (fieldValue: string) =>
    OPERATOR_DEFINITIONS[getFieldType(fieldValue)] || OPERATOR_DEFINITIONS.text;

  const needsValueInput = (operator: FilterOperator): boolean =>
    !['is_empty', 'is_not_empty'].includes(operator);

  const rules = group.rules ?? [];
  const groups = group.groups ?? [];

  const setLogic = (logic: 'and' | 'or') => onChange({ ...group, logic });

  const addRule = () =>
    onChange({ ...group, rules: [...rules, newRule(entityType)] });

  const updateRule = (index: number, updates: Partial<FilterRule>) => {
    const next = rules.slice();
    next[index] = { ...next[index], ...updates };
    onChange({ ...group, rules: next });
  };

  const removeRule = (index: number) =>
    onChange({ ...group, rules: rules.filter((_, i) => i !== index) });

  const addGroup = () =>
    onChange({ ...group, groups: [...groups, emptyGroup()] });

  const updateGroup = (index: number, child: FilterTree) => {
    const next = groups.slice();
    next[index] = child;
    onChange({ ...group, groups: next });
  };

  const removeGroup = (index: number) =>
    onChange({ ...group, groups: groups.filter((_, i) => i !== index) });

  const hasChildren = rules.length + groups.length > 0;
  const canAddGroup = depth < MAX_DEPTH;

  return (
    <div
      className={
        isRoot
          ? 'space-y-3'
          : 'space-y-3 rounded-md border border-border bg-muted/30 p-3'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Match</span>
          <Segmented
            value={group.logic}
            onChange={(v) => setLogic(v as 'and' | 'or')}
            options={[
              { value: 'and', label: 'AND' },
              { value: 'or', label: 'OR' },
            ]}
          />
        </div>
        {!isRoot && onRemove && (
          <Button variant="ghost" size="icon" onClick={onRemove} className="size-7">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {!hasChildren && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          No rules yet. Add a rule{canAddGroup ? ' or a group' : ''} to filter.
        </div>
      )}

      {/* Rule rows */}
      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div key={`${index}-${rule.field}`} className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Field</Label>
                <Select
                  value={rule.field}
                  onValueChange={(value) => {
                    const operators = OPERATOR_DEFINITIONS[getFieldType(value)];
                    updateRule(index, {
                      field: value,
                      operator: operators[0]?.value || 'equals',
                      value: '',
                    });
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((field) => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Operator</Label>
                <Select
                  value={rule.operator}
                  onValueChange={(value) =>
                    updateRule(index, { operator: value as FilterOperator })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getOperatorsForField(rule.field).map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {needsValueInput(rule.operator) && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Value</Label>
                  <Input
                    type={
                      getFieldType(rule.field) === 'number'
                        ? 'number'
                        : getFieldType(rule.field) === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={(rule.value as string | number | undefined) ?? ''}
                    onChange={(e) => updateRule(index, { value: e.target.value })}
                    placeholder="Enter value..."
                    className="h-9"
                  />
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeRule(index)}
              className="mt-6 size-9"
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      {/* Nested groups */}
      {groups.map((child, index) => (
        <GroupEditor
          key={`group-${index}-${child.logic}`}
          entityType={entityType}
          group={child}
          depth={depth + 1}
          onChange={(c) => updateGroup(index, c)}
          onRemove={() => removeGroup(index)}
        />
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={addRule}>
          <Plus className="mr-2 size-4" />
          Add rule
        </Button>
        {canAddGroup && (
          <Button variant="outline" size="sm" onClick={addGroup}>
            <FolderPlus className="mr-2 size-4" />
            Add group
          </Button>
        )}
      </div>
    </div>
  );
}

export function FilterBuilder({ entityType, tree, onChange }: FilterBuilderProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Filters</CardTitle>
      </CardHeader>
      <CardContent>
        <GroupEditor
          entityType={entityType}
          group={tree}
          depth={1}
          isRoot
          onChange={onChange}
        />
      </CardContent>
    </Card>
  );
}
