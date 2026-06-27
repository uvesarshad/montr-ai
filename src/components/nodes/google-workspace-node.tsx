'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { FileSpreadsheet, FileText, Presentation, FormInput, Loader2 } from 'lucide-react';
import NodeShell from './node-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type GService = 'sheets' | 'docs' | 'slides' | 'forms';
type GAction = 'read' | 'write' | 'append' | 'create';

const SERVICE_INFO: Record<GService, { icon: React.ComponentType<{ className?: string }>; label: string; color: string; actions: { value: GAction; label: string }[] }> = {
    sheets: {
        icon: FileSpreadsheet,
        label: 'Sheets',
        color: 'text-green-600',
        actions: [
            { value: 'read', label: 'Read Data' },
            { value: 'write', label: 'Write Data' },
            { value: 'append', label: 'Append Row' },
        ],
    },
    docs: {
        icon: FileText,
        label: 'Docs',
        color: 'text-blue-600',
        actions: [
            { value: 'read', label: 'Read Document' },
            { value: 'create', label: 'Create Document' },
            { value: 'write', label: 'Append Content' },
        ],
    },
    slides: {
        icon: Presentation,
        label: 'Slides',
        color: 'text-yellow-600',
        actions: [
            { value: 'read', label: 'Read Presentation' },
            { value: 'create', label: 'Create Presentation' },
        ],
    },
    forms: {
        icon: FormInput,
        label: 'Forms',
        color: 'text-purple-600',
        actions: [
            { value: 'read', label: 'Read Responses' },
            { value: 'create', label: 'Create Form' },
        ],
    },
};

interface GoogleWorkspaceNodeData {
    service?: GService;
    action?: GAction;
    documentId?: string;
    sheetRange?: string;
    content?: string;
}

function GoogleWorkspaceNode({ id, data, isConnectable, selected }: NodeProps<GoogleWorkspaceNodeData>) {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

    const [service, setService] = useState<GService>(data.service || 'sheets');
    const [action, setAction] = useState<GAction>(data.action || 'read');
    const [documentId, setDocumentId] = useState(data.documentId || '');
    const [sheetRange, setSheetRange] = useState(data.sheetRange || '');
    const [content, setContent] = useState(data.content || '');
    const [isLoading, setIsLoading] = useState(false);

    const serviceInfo = SERVICE_INFO[service];
    const ServiceIcon = serviceInfo.icon;

    const handleServiceChange = (val: GService) => {
        setService(val);
        // Reset action to the first valid action for the new service
        setAction(SERVICE_INFO[val].actions[0].value);
    };

    const handleAction = useCallback(async () => {
        setIsLoading(true);
        try {
            const text = content || getIncomingContent();
            updateNodeData({
                service,
                action,
                documentId,
                sheetRange: service === 'sheets' ? sheetRange : undefined,
                content: (action === 'write' || action === 'append' || action === 'create') ? text : undefined,
            });
            toast({ title: 'Configured', description: `${serviceInfo.label} ${action} ready for execution.` });
        } finally {
            setIsLoading(false);
        }
    }, [service, action, documentId, sheetRange, content, getIncomingContent, updateNodeData, toast, serviceInfo.label]);

    return (
        <NodeShell
            id={id}
            nodeType="googleWorkspaceNode"
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={true}
            minWidth={300}
            contentClassName="p-4 relative"
            title="Google Workspace"
            icon={<ServiceIcon className={cn("h-full w-full", serviceInfo.color)} />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType="googleWorkspaceNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                {/* Service Selector (Tabs) */}
                <div className="grid grid-cols-4 gap-1 bg-muted/30 p-0.5 rounded-xl">
                    {(Object.entries(SERVICE_INFO) as [GService, typeof SERVICE_INFO[GService]][]).map(([key, info]) => {
                        const Icon = info.icon;
                        return (
                            <button
                                key={key}
                                className={cn(
                                    'flex flex-col items-center gap-0.5 py-1.5 rounded-lg transition-all text-[9px] font-medium',
                                    service === key
                                        ? 'bg-background shadow-sm text-foreground'
                                        : 'text-muted-foreground hover:text-foreground'
                                )}
                                onClick={() => handleServiceChange(key)}
                            >
                                <Icon className={cn("size-3.5", service === key ? info.color : '')} />
                                {info.label}
                            </button>
                        );
                    })}
                </div>

                {/* Action */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <Select value={action} onValueChange={(v) => setAction(v as GAction)}>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {serviceInfo.actions.map(({ value, label }) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Account */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Google Account</Label>
                    <Select>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue placeholder="Connect Google" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="connect">Connect Google →</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Document ID (for read/write/append) */}
                {action !== 'create' && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Document ID / URL</Label>
                        <Input
                            value={documentId}
                            onChange={(e) => setDocumentId(e.target.value)}
                            placeholder="Paste document ID or URL..."
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                )}

                {/* Sheet-specific: Range */}
                {service === 'sheets' && action !== 'create' && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cell Range</Label>
                        <Input
                            value={sheetRange}
                            onChange={(e) => setSheetRange(e.target.value)}
                            placeholder="e.g., Sheet1!A1:E10"
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                )}

                {/* Content (for write/append/create) */}
                {(action === 'write' || action === 'append' || action === 'create') && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Content</Label>
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Content to write or connect from a node..."
                            className="min-h-[50px] text-xs resize-none rounded-xl"
                            rows={3}
                        />
                    </div>
                )}

                <Button
                    size="sm"
                    className="w-full h-8 text-xs rounded-xl"
                    onClick={handleAction}
                    disabled={isLoading}
                >
                    {isLoading && <Loader2 className="size-3 animate-spin mr-1.5" />}
                    Configure
                </Button>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="googleWorkspaceNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(GoogleWorkspaceNode);
