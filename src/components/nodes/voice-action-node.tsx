'use client';

/**
 * Generic canvas node for the voice flow-builder action processors.
 *
 * One component serves all voice node types — the ReactFlow node `type`
 * (e.g. 'voiceMakeCall') selects a config block below. Fields persist straight
 * into node.data with flat keys that match what each processor reads from its
 * resolved `config`. Provider/credential resolution + org scoping happen
 * server-side in the processors, so no secrets live on the canvas.
 *
 * Mirrors the crm-action-node / integration-hub-node pattern (a single by-type
 * component with a def-map). Canvas internals use shadcn primitives by design
 * (editor internals are excluded from the ui-kit migration — see CLAUDE.md).
 */

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import {
    PhoneCall,
    PhoneForwarded,
    PhoneOff,
    PhoneIncoming,
    MessageSquare,
    Hash,
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

interface VoiceNodeDef {
    title: string;
    icon: LucideIcon;
    hint?: string;
    fields: FieldDef[];
}

const YES_NO: OptionDef[] = [
    { value: 'false', label: 'No' },
    { value: 'true', label: 'Yes' },
];

export const VOICE_NODE_DEFS: Record<string, VoiceNodeDef> = {
    voiceMakeCall: {
        title: 'Make Call',
        icon: PhoneCall,
        hint: 'Places an AI voice call. Outputs { callSessionId, providerCallId, status }.',
        fields: [
            { key: 'to', label: 'To (number)', placeholder: '+14155551234 or {{trigger.contact.phone}}' },
            { key: 'contactId', label: 'Contact ID', placeholder: '{{trigger.record._id}} (optional)' },
            { key: 'from', label: 'From (caller ID)', placeholder: 'optional — uses an owned number' },
            { key: 'aiBotId', label: 'AI bot ID', placeholder: 'optional — bot that talks on the call' },
            { key: 'recordCall', label: 'Record call', options: YES_NO, defaultValue: 'false' },
            { key: 'machineDetection', label: 'Answering-machine detection', options: YES_NO, defaultValue: 'false' },
        ],
    },
    voiceWaitOutcome: {
        title: 'Wait for Call Outcome',
        icon: PhoneIncoming,
        hint: 'Pauses until the call completes. Outputs { matched, callSessionId, durationSec, disposition }. Branch on the outcome.',
        fields: [
            { key: 'contactId', label: 'Contact ID', placeholder: '{{trigger.record._id}} (defaults to triggering contact)' },
            { key: 'maxWaitSec', label: 'Max wait (seconds)', placeholder: '300' },
        ],
    },
    voiceGatherDtmf: {
        title: 'Gather Keypad (DTMF)',
        icon: Hash,
        hint: 'Waits for the caller to press keys, then branch on the digits via labelled edges (e.g. "1", "2", "timeout").',
        fields: [
            { key: 'contactId', label: 'Contact ID', placeholder: '{{trigger.record._id}} (defaults to triggering contact)' },
            { key: 'maxWaitSec', label: 'Max wait (seconds)', placeholder: '30' },
            { key: 'numDigits', label: 'Expected digits', placeholder: 'e.g. 1 (optional)' },
        ],
    },
    voiceTransfer: {
        title: 'Transfer Call',
        icon: PhoneForwarded,
        hint: 'Transfers a live call to a human/agent.',
        fields: [
            { key: 'callSessionId', label: 'Call session', placeholder: '{{nodes.makeCall.output.callSessionId}}' },
            { key: 'to', label: 'Transfer to', placeholder: '+14155550123 / agent number' },
            {
                key: 'mode',
                label: 'Mode',
                options: [
                    { value: 'warm', label: 'Warm (bridge into a conference)' },
                    { value: 'cold', label: 'Cold (redirect, agent drops)' },
                ],
                defaultValue: 'warm',
            },
            { key: 'callerId', label: 'Caller ID', placeholder: 'optional' },
        ],
    },
    voiceHangup: {
        title: 'Hang Up',
        icon: PhoneOff,
        hint: 'Ends a live call.',
        fields: [
            { key: 'callSessionId', label: 'Call session', placeholder: '{{nodes.makeCall.output.callSessionId}}' },
        ],
    },
    voiceSendSms: {
        title: 'Send SMS',
        icon: MessageSquare,
        hint: 'Sends a text via your voice number. Resolves the destination from a contact or explicit number.',
        fields: [
            { key: 'to', label: 'To (number)', placeholder: '+14155551234 or {{trigger.contact.phone}}' },
            { key: 'contactId', label: 'Contact ID', placeholder: '{{trigger.record._id}} (optional)' },
            { key: 'message', label: 'Message', textarea: true, placeholder: 'Hi {{contact.firstName}}, your order shipped.' },
        ],
    },
};

type NodeData = Record<string, unknown>;

function VoiceActionNode({ id, type, data, isConnectable, selected }: NodeProps<NodeData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);

    const def = VOICE_NODE_DEFS[type];
    if (!def) return null;

    const Icon = def.icon;

    return (
        <NodeShell
            id={id}
            nodeType={type}
            selected={selected}
            onDelete={deleteNode}
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

export default memo(VoiceActionNode);
export const VOICE_ACTION_NODE_TYPES = Object.keys(VOICE_NODE_DEFS);
