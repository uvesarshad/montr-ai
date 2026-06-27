'use client';

/**
 * Generic canvas node for the CRM action processors.
 *
 * One component serves all CRM action node types — the ReactFlow node `type`
 * (e.g. 'crmCreateContact') selects a config block below. Fields persist
 * straight into node.data; execution resolves the target record + organization
 * scope server-side (the processors are org-scoped), so no sensitive data
 * lives in the canvas.
 *
 * Mirrors the integration-hub-node pattern (a single by-type component). Canvas
 * node internals intentionally use the shadcn primitives (editor internals are
 * excluded from the ui-kit migration — see CLAUDE.md).
 */

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import {
    UserPlus,
    UserCog,
    Briefcase,
    BriefcaseBusiness,
    MoveRight,
    UserCheck,
    Tag,
    TagsIcon,
    CalendarPlus,
    CheckSquare,
    StickyNote,
    Search,
    SearchCheck,
    Trash2,
    type LucideIcon,
} from 'lucide-react';
import NodeShell from './node-shell';
import NodeHandle from './node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
    textarea?: boolean;
    /** When present, the field renders a Select instead of a text input. */
    options?: OptionDef[];
    defaultValue?: string;
}

interface CrmNodeDef {
    title: string;
    icon: LucideIcon;
    /** Short helper shown at the bottom of the node body. */
    hint?: string;
    fields: FieldDef[];
    /** When true, richer config lives in the Advanced sidebar panel. */
    hasAdvanced?: boolean;
}

const ENTITY_OPTIONS: OptionDef[] = [
    { value: 'contact', label: 'Contact' },
    { value: 'company', label: 'Company' },
    { value: 'deal', label: 'Deal' },
];

export const CRM_NODE_DEFS: Record<string, CrmNodeDef> = {
    crmCreateContact: {
        title: 'Create Contact',
        icon: UserPlus,
        hint: 'Creates a new contact in the run organization.',
        fields: [
            { key: 'firstName', label: 'First name', placeholder: 'Ada' },
            { key: 'lastName', label: 'Last name', placeholder: 'Lovelace' },
            { key: 'email', label: 'Email', placeholder: 'ada@example.com' },
            { key: 'phone', label: 'Phone', placeholder: '+15551234' },
        ],
    },
    crmUpdateContact: {
        title: 'Update Contact',
        icon: UserCog,
        hint: 'Leave Contact ID blank to update the triggering contact.',
        fields: [
            { key: 'contactId', label: 'Contact ID', placeholder: '{{trigger.record._id}}' },
            { key: 'updates', label: 'Updates (JSON)', textarea: true, placeholder: '{"status": "customer"}' },
        ],
    },
    crmCreateDeal: {
        title: 'Create Deal',
        icon: Briefcase,
        fields: [
            { key: 'name', label: 'Deal name', placeholder: 'New opportunity' },
            { key: 'amount', label: 'Amount', placeholder: '5000' },
            { key: 'pipelineId', label: 'Pipeline ID', placeholder: 'pipeline id' },
            { key: 'stageId', label: 'Stage ID', placeholder: 'stage id' },
            { key: 'contactId', label: 'Contact ID', placeholder: '{{trigger.record._id}}' },
        ],
    },
    crmUpdateDeal: {
        title: 'Update Deal',
        icon: BriefcaseBusiness,
        hint: 'Leave Deal ID blank to update the triggering deal.',
        fields: [
            { key: 'dealId', label: 'Deal ID', placeholder: '{{trigger.record._id}}' },
            { key: 'updates', label: 'Updates (JSON)', textarea: true, placeholder: '{"amount": 7500}' },
        ],
    },
    crmMoveStage: {
        title: 'Move Deal Stage',
        icon: MoveRight,
        hint: 'Records stage history. Leave Deal ID blank to use the triggering deal.',
        fields: [
            { key: 'dealId', label: 'Deal ID', placeholder: '{{trigger.record._id}}' },
            { key: 'stageId', label: 'Target stage ID', placeholder: 'stage id' },
        ],
    },
    crmAssignOwner: {
        title: 'Assign Owner',
        icon: UserCheck,
        fields: [
            { key: 'entityType', label: 'Entity', options: ENTITY_OPTIONS, defaultValue: 'contact' },
            {
                key: 'strategy',
                label: 'Strategy',
                options: [
                    { value: 'specific', label: 'Specific user' },
                    { value: 'round_robin', label: 'Round robin' },
                    { value: 'load_balanced', label: 'Load balanced' },
                ],
                defaultValue: 'specific',
            },
            { key: 'userId', label: 'Owner user ID', placeholder: 'user id (for Specific)' },
        ],
    },
    crmAddTag: {
        title: 'Add Tag',
        icon: Tag,
        hint: 'Creates the tag if it does not exist.',
        fields: [
            { key: 'entityType', label: 'Entity', options: ENTITY_OPTIONS, defaultValue: 'contact' },
            { key: 'tagName', label: 'Tag name', placeholder: 'VIP' },
        ],
    },
    crmRemoveTag: {
        title: 'Remove Tag',
        icon: TagsIcon,
        fields: [
            { key: 'entityType', label: 'Entity', options: ENTITY_OPTIONS, defaultValue: 'contact' },
            { key: 'tagName', label: 'Tag name', placeholder: 'VIP' },
        ],
    },
    crmCreateActivity: {
        title: 'Create Activity',
        icon: CalendarPlus,
        fields: [
            {
                key: 'activityType',
                label: 'Activity type',
                options: [
                    { value: 'note', label: 'Note' },
                    { value: 'call', label: 'Call' },
                    { value: 'meeting', label: 'Meeting' },
                    { value: 'email', label: 'Email' },
                    { value: 'task', label: 'Task' },
                ],
                defaultValue: 'note',
            },
            { key: 'subject', label: 'Subject', placeholder: 'Followed up' },
            { key: 'body', label: 'Body', textarea: true, placeholder: 'Details…' },
        ],
    },
    crmCreateTask: {
        title: 'Create Task',
        icon: CheckSquare,
        fields: [
            { key: 'title', label: 'Task title', placeholder: 'Call back' },
            { key: 'dueInDays', label: 'Due in (days)', placeholder: '3' },
            {
                key: 'assignTo',
                label: 'Assign to',
                options: [
                    { value: 'owner', label: 'Record owner' },
                    { value: 'specific', label: 'Specific user' },
                    { value: 'creator', label: 'Workflow owner' },
                ],
                defaultValue: 'owner',
            },
            { key: 'assigneeId', label: 'Assignee user ID', placeholder: 'user id (for Specific)' },
        ],
    },
    crmLogNote: {
        title: 'Log Note',
        icon: StickyNote,
        hint: 'Leave Record ID blank to use the triggering record.',
        fields: [
            { key: 'targetType', label: 'Record type', options: ENTITY_OPTIONS, defaultValue: 'contact' },
            { key: 'targetId', label: 'Record ID', placeholder: '{{trigger.record._id}}' },
            { key: 'body', label: 'Note', textarea: true, placeholder: 'Spoke with customer.' },
        ],
    },
    crmFindRecord: {
        title: 'Find Record',
        icon: Search,
        hint: 'Outputs { found, record }.',
        fields: [
            { key: 'entityType', label: 'Entity', options: ENTITY_OPTIONS, defaultValue: 'contact' },
            {
                key: 'matchField',
                label: 'Match field',
                options: [
                    { value: 'email', label: 'Email' },
                    { value: 'phone', label: 'Phone' },
                    { value: 'name', label: 'Name' },
                    { value: 'domain', label: 'Domain' },
                ],
                defaultValue: 'email',
            },
            { key: 'matchValue', label: 'Match value', placeholder: '{{trigger.email}}' },
        ],
    },
    crmFindRecords: {
        title: 'Find Records',
        icon: SearchCheck,
        hint: 'Outputs { records, count }. Build filters in Advanced, then feed into "Run once per item".',
        hasAdvanced: true,
        fields: [
            { key: 'entityType', label: 'Entity', options: ENTITY_OPTIONS, defaultValue: 'contact' },
        ],
    },
    crmDeleteRecord: {
        title: 'Delete Record',
        icon: Trash2,
        hint: 'Hard-delete. Leave Record ID blank to use the triggering record.',
        fields: [
            { key: 'entityType', label: 'Entity', options: ENTITY_OPTIONS, defaultValue: 'contact' },
            { key: 'recordId', label: 'Record ID', placeholder: '{{trigger.record._id}}' },
        ],
    },
};

type NodeData = Record<string, unknown>;

function CrmActionNode({ id, type, data, isConnectable, selected }: NodeProps<NodeData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);

    const def = CRM_NODE_DEFS[type];
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
                        const value = (typeof data[field.key] === 'string' && (data[field.key] as string)) || field.defaultValue || field.options[0].value;
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
                    return field.textarea ? (
                        <div key={field.key} className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Textarea
                                value={(data[field.key] as string) || ''}
                                onChange={(e) => updateNodeData({ [field.key]: e.target.value })}
                                placeholder={field.placeholder}
                                className="min-h-[50px] text-xs resize-none rounded-xl"
                                rows={3}
                            />
                        </div>
                    ) : (
                        <div key={field.key} className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">{field.label}</Label>
                            <Input
                                value={(data[field.key] as string) || ''}
                                onChange={(e) => updateNodeData({ [field.key]: e.target.value })}
                                placeholder={field.placeholder}
                                className="h-8 text-xs rounded-xl"
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

export default memo(CrmActionNode);
export const CRM_ACTION_NODE_TYPES = Object.keys(CRM_NODE_DEFS);
