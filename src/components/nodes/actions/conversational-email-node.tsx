'use client';

import React, { memo, useReducer, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { MessageCircle, User } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ConversationalEmailData {
    recipientField?: string;
    subject?: string;
    body?: string;
    fromName?: string;
    replyTo?: string;
}

interface EmailFormState {
    recipientField: string;
    subject: string;
    body: string;
    fromName: string;
    replyTo: string;
}

type EmailFormAction = {
    [K in keyof EmailFormState]: { field: K; value: EmailFormState[K] };
}[keyof EmailFormState];

function emailFormReducer(state: EmailFormState, action: EmailFormAction): EmailFormState {
    return { ...state, [action.field]: action.value };
}

function ConversationalEmailNode({ id, data, selected }: NodeProps<ConversationalEmailData>) {
    const [form, dispatch] = useReducer(emailFormReducer, {
        recipientField: data.recipientField || '{{$trigger.contact.email}}',
        subject: data.subject || '',
        body: data.body || '',
        fromName: data.fromName || '',
        replyTo: data.replyTo || '',
    });
    const { recipientField, subject, body, fromName, replyTo } = form;

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="actionConversationalEmail"
            selected={selected}
            title="Conversational Email"
            icon={<MessageCircle className="size-3.5" />}
            minWidth={320}
            minHeight={340}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-cyan-100/50 dark:bg-cyan-900/20 rounded-xl">
                    <User className="size-5 text-cyan-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                            Conversational Email
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Send personalized 1:1 email (like a reply)
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">To (Recipient)</Label>
                        <Input
                            value={recipientField}
                            onChange={(e) => dispatch({ field: 'recipientField', value: e.target.value })}
                            placeholder="{{$trigger.contact.email}}"
                            className="h-9 rounded-xl text-xs font-mono"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <Label className="text-xs">From Name</Label>
                            <Input
                                value={fromName}
                                onChange={(e) => dispatch({ field: 'fromName', value: e.target.value })}
                                placeholder="John from Sales"
                                className="h-9 rounded-xl text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Reply-To</Label>
                            <Input
                                value={replyTo}
                                onChange={(e) => dispatch({ field: 'replyTo', value: e.target.value })}
                                placeholder="john@company.com"
                                className="h-9 rounded-xl text-xs"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Subject</Label>
                        <Input
                            value={subject}
                            onChange={(e) => dispatch({ field: 'subject', value: e.target.value })}
                            placeholder="Re: Your inquiry about {{$trigger.product}}"
                            className="h-9 rounded-xl text-xs"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Message</Label>
                        <Textarea
                            value={body}
                            onChange={(e) => dispatch({ field: 'body', value: e.target.value })}
                            placeholder="Hi {{$trigger.contact.firstName}},

Thanks for reaching out! I'd love to help you with..."
                            className="min-h-[80px] rounded-xl text-xs resize-none"
                        />
                    </div>
                </div>
            </div>

            {/* Input handle */}
            <NodeHandle
                type="target"
                position={Position.Left}
                nodeType="actionConversationalEmail"
            />

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="actionConversationalEmail"
            />
        </NodeShell>
    );
}

export default memo(ConversationalEmailNode);
