'use client';

/**
 * Generic canvas node for the data-transform processors (H7 / TODO 2.2):
 * Edit Fields, Deduplicate, Merge, Sort, Aggregate/Group, Date/Time.
 *
 * One component serves all six — the ReactFlow node `type` selects a config
 * block below. Simple scalar fields render inline on the node; row-based config
 * (operations / aggregations) and the rest live in the Advanced sidebar panel.
 *
 * Mirrors the CRM-action-node / integration-hub-node pattern (a single by-type
 * component). Canvas node internals intentionally use shadcn primitives (editor
 * internals are excluded from the ui-kit migration — see CLAUDE.md).
 */

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import {
    PencilLine,
    CopyMinus,
    GitMerge,
    ArrowDownUp,
    Sigma,
    CalendarClock,
    type LucideIcon,
} from 'lucide-react';
import NodeShell from './node-shell';
import NodeHandle from './node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNodeUtils } from '@/hooks/use-node-utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface OptionDef {
    value: string;
    label: string;
}

interface FieldDef {
    key: string;
    label: string;
    placeholder?: string;
    /** When present, renders a Select instead of a text input. */
    options?: OptionDef[];
    defaultValue?: string;
}

interface TransformNodeDef {
    title: string;
    icon: LucideIcon;
    hint?: string;
    fields: FieldDef[];
    /** When true, richer row-based config lives in the Advanced sidebar panel. */
    hasAdvanced?: boolean;
}

export const DATA_TRANSFORM_NODE_DEFS: Record<string, TransformNodeDef> = {
    editFieldsNode: {
        title: 'Edit Fields',
        icon: PencilLine,
        hint: 'Set / rename / remove fields. Build operation rows in Advanced.',
        hasAdvanced: true,
        fields: [
            { key: 'source', label: 'Source (object or array)', placeholder: '$findRecords.records' },
        ],
    },
    dedupeNode: {
        title: 'Deduplicate',
        icon: CopyMinus,
        hint: 'Outputs { items, count, removed }.',
        fields: [
            { key: 'source', label: 'Source array', placeholder: '$findRecords.records' },
            { key: 'compareBy', label: 'Compare by (comma list)', placeholder: 'email (empty = whole item)' },
            {
                key: 'keep',
                label: 'Keep',
                options: [
                    { value: 'first', label: 'First occurrence' },
                    { value: 'last', label: 'Last occurrence' },
                ],
                defaultValue: 'first',
            },
        ],
    },
    mergeNode: {
        title: 'Merge',
        icon: GitMerge,
        hint: 'Combine two inputs.',
        fields: [
            {
                key: 'mode',
                label: 'Mode',
                options: [
                    { value: 'append', label: 'Append (concat arrays)' },
                    { value: 'merge-by-key', label: 'Merge by key' },
                    { value: 'combine-fields', label: 'Combine fields' },
                ],
                defaultValue: 'append',
            },
            { key: 'sourceA', label: 'Source A', placeholder: '$nodeA.records' },
            { key: 'sourceB', label: 'Source B', placeholder: '$nodeB.records' },
            { key: 'key', label: 'Key (for merge-by-key)', placeholder: 'id' },
        ],
    },
    sortNode: {
        title: 'Sort',
        icon: ArrowDownUp,
        fields: [
            { key: 'source', label: 'Source array', placeholder: '$findRecords.records' },
            { key: 'field', label: 'Sort by field', placeholder: 'createdAt (empty = item)' },
            {
                key: 'direction',
                label: 'Direction',
                options: [
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                ],
                defaultValue: 'asc',
            },
            {
                key: 'type',
                label: 'Compare as',
                options: [
                    { value: 'string', label: 'Text' },
                    { value: 'number', label: 'Number' },
                    { value: 'date', label: 'Date' },
                ],
                defaultValue: 'string',
            },
        ],
    },
    aggregateNode: {
        title: 'Aggregate / Group',
        icon: Sigma,
        hint: 'Build aggregation rows in Advanced.',
        hasAdvanced: true,
        fields: [
            { key: 'source', label: 'Source array', placeholder: '$findRecords.records' },
            { key: 'groupBy', label: 'Group by field', placeholder: 'status (empty = flat)' },
        ],
    },
    dateTimeNode: {
        title: 'Date / Time',
        icon: CalendarClock,
        hint: 'Outputs { result }.',
        fields: [
            {
                key: 'op',
                label: 'Operation',
                options: [
                    { value: 'now', label: 'Now' },
                    { value: 'add', label: 'Add' },
                    { value: 'subtract', label: 'Subtract' },
                    { value: 'format', label: 'Format' },
                    { value: 'diff', label: 'Difference' },
                    { value: 'parse', label: 'Parse' },
                ],
                defaultValue: 'now',
            },
            { key: 'input', label: 'Input date', placeholder: '{{trigger.createdAt}}' },
            { key: 'amount', label: 'Amount', placeholder: '3' },
            {
                key: 'unit',
                label: 'Unit',
                options: [
                    { value: 'minutes', label: 'Minutes' },
                    { value: 'hours', label: 'Hours' },
                    { value: 'days', label: 'Days' },
                    { value: 'weeks', label: 'Weeks' },
                    { value: 'months', label: 'Months' },
                ],
                defaultValue: 'days',
            },
        ],
    },
};

type NodeData = Record<string, unknown>;

function DataTransformNode({ id, type, data, isConnectable, selected }: NodeProps<NodeData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);

    const def = DATA_TRANSFORM_NODE_DEFS[type];
    if (!def) return null;

    const Icon = def.icon;

    return (
        <NodeShell
            id={id}
            nodeType={type}
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={def.hasAdvanced === true}
            minWidth={280}
            contentClassName="p-4 relative"
            title={def.title}
            icon={<Icon className="h-full w-full p-0.5" />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType={type} isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                {def.fields.map((field) => {
                    if (field.options) {
                        const value =
                            (typeof data[field.key] === 'string' && (data[field.key] as string)) ||
                            field.defaultValue ||
                            field.options[0].value;
                        return (
                            <div key={field.key} className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">{field.label}</Label>
                                <Select value={value} onValueChange={(v) => updateNodeData({ [field.key]: v })}>
                                    <SelectTrigger className="h-8 text-xs rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {field.options.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>
                                                {o.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    }
                    return (
                        <div key={field.key} className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Input
                                value={(data[field.key] as string) || ''}
                                onChange={(e) => updateNodeData({ [field.key]: e.target.value })}
                                placeholder={field.placeholder}
                                className="h-8 text-xs rounded-xl font-mono"
                            />
                        </div>
                    );
                })}

                {def.hint ? (
                    <p className="text-[10px] leading-snug text-muted-foreground">{def.hint}</p>
                ) : null}
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType={type} isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(DataTransformNode);
export const DATA_TRANSFORM_NODE_TYPES = Object.keys(DATA_TRANSFORM_NODE_DEFS);
