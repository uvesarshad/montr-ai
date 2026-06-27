import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

export interface FieldCondition {
    id: string;
    fieldId: string; // ID of the field to watch
    operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'isEmpty' | 'isNotEmpty';
    value: string;
    action: 'show' | 'hide';
}

interface ConditionBuilderProps {
    conditions: FieldCondition[];
    availableFields: Array<{ id: string; label: string; type: string }>;
    onChange: (conditions: FieldCondition[]) => void;
}

export function ConditionBuilder({ conditions, availableFields, onChange }: ConditionBuilderProps) {
    const addCondition = () => {
        const newCondition: FieldCondition = {
            id: `cond-${Date.now()}`,
            fieldId: availableFields[0]?.id || '',
            operator: 'equals',
            value: '',
            action: 'show'
        };
        onChange([...conditions, newCondition]);
    };

    const updateCondition = (index: number, updates: Partial<FieldCondition>) => {
        const newConditions = [...conditions];
        newConditions[index] = { ...newConditions[index], ...updates };
        onChange(newConditions);
    };

    const removeCondition = (index: number) => {
        onChange(conditions.filter((_, i) => i !== index));
    };

    if (availableFields.length === 0) {
        return (
            <div className="text-xs text-muted-foreground p-2 border border-dashed rounded">
                No other fields available for conditions. Add more fields above this one.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Conditional Logic</div>

            {conditions.length === 0 ? (
                <div className="text-xs text-muted-foreground p-2 border border-dashed rounded">
                    No conditions set. This field will always be visible.
                </div>
            ) : (
                <div className="space-y-2">
                    {conditions.map((condition, index) => (
                        <div key={condition.id} className="flex items-center gap-2 p-2 border rounded bg-muted/20">
                            {/* Action */}
                            <Select
                                value={condition.action}
                                onValueChange={(v) => updateCondition(index, { action: v as 'show' | 'hide' })}
                            >
                                <SelectTrigger className="h-7 w-16 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="show">Show</SelectItem>
                                    <SelectItem value="hide">Hide</SelectItem>
                                </SelectContent>
                            </Select>

                            <span className="text-xs text-muted-foreground">if</span>

                            {/* Field */}
                            <Select
                                value={condition.fieldId}
                                onValueChange={(v) => updateCondition(index, { fieldId: v })}
                            >
                                <SelectTrigger className="h-7 flex-1 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFields.map((field) => (
                                        <SelectItem key={field.id} value={field.id} className="text-xs">
                                            {field.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Operator */}
                            <Select
                                value={condition.operator}
                                onValueChange={(v) => updateCondition(index, { operator: v as FieldCondition['operator'] })}
                            >
                                <SelectTrigger className="h-7 w-28 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="equals">equals</SelectItem>
                                    <SelectItem value="notEquals">not equals</SelectItem>
                                    <SelectItem value="contains">contains</SelectItem>
                                    <SelectItem value="greaterThan">{'>'}</SelectItem>
                                    <SelectItem value="lessThan">{'<'}</SelectItem>
                                    <SelectItem value="isEmpty">is empty</SelectItem>
                                    <SelectItem value="isNotEmpty">is not empty</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Value (only for operators that need it) */}
                            {!['isEmpty', 'isNotEmpty'].includes(condition.operator) && (
                                <Input
                                    value={condition.value}
                                    onChange={(e) => updateCondition(index, { value: e.target.value })}
                                    placeholder="value"
                                    className="h-7 flex-1 text-xs"
                                />
                            )}

                            {/* Remove */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => removeCondition(index)}
                            >
                                <X className="size-3" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={addCondition}
                className="h-7 text-xs"
            >
                <Plus className="size-3 mr-1" />
                Add Condition
            </Button>
        </div>
    );
}

// Helper function to evaluate conditions
export function evaluateConditions(
    conditions: FieldCondition[],
    answers: Record<string, unknown>
): boolean {
    if (conditions.length === 0) return true; // No conditions = always visible

    // Evaluate all conditions (AND logic)
    for (const condition of conditions) {
        const fieldValue = answers[condition.fieldId];
        const conditionMet = evaluateCondition(condition, fieldValue);

        // If action is 'show', condition must be met
        // If action is 'hide', condition being met means hide (return false)
        if (condition.action === 'show' && !conditionMet) {
            return false;
        }
        if (condition.action === 'hide' && conditionMet) {
            return false;
        }
    }

    return true;
}

function evaluateCondition(condition: FieldCondition, fieldValue: unknown): boolean {
    const value = String(fieldValue || '');
    const targetValue = condition.value;

    switch (condition.operator) {
        case 'equals':
            return value === targetValue;
        case 'notEquals':
            return value !== targetValue;
        case 'contains':
            return value.toLowerCase().includes(targetValue.toLowerCase());
        case 'greaterThan':
            return Number(value) > Number(targetValue);
        case 'lessThan':
            return Number(value) < Number(targetValue);
        case 'isEmpty':
            return !value || value.trim() === '';
        case 'isNotEmpty':
            return Boolean(value && value.trim() !== '');
        default:
            return true;
    }
}
