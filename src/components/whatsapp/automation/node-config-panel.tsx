'use client';

import React from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getNodeDefinition, type NodeType } from '@/lib/whatsapp/automation/node-definitions';
import { X, Plus } from 'lucide-react';
import { MultilingualInput } from './multilingual-input';

type NodeConfig = Record<string, unknown>;

interface WorkflowNode {
    id: string;
    data: {
        nodeType: NodeType;
        subType: string;
        label?: string;
        config?: NodeConfig;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface NodeConfigPanelProps {
    node: WorkflowNode | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (nodeId: string, data: WorkflowNode['data']) => void;
}

interface ConfigComponentProps {
    config: NodeConfig;
    updateConfig: (key: string, value: unknown) => void;
}

export function NodeConfigPanel({ node, isOpen, onClose, onSave }: NodeConfigPanelProps) {
    const [config, setConfig] = React.useState<NodeConfig>(node?.data?.config || {});
    const [label, setLabel] = React.useState<string>(node?.data?.label || '');

    React.useEffect(() => {
        if (node) {
            setConfig(node.data?.config || {});
            setLabel(node.data?.label || '');
        }
    }, [node]);

    if (!node) return null;

    const definition = getNodeDefinition(node.data.nodeType, node.data.subType);
    if (!definition) return null;

    const handleSave = () => {
        onSave(node.id, {
            ...node.data,
            label,
            config,
            preview: generatePreview(definition.subType, config),
        });
        onClose();
    };

    const updateConfig = (key: string, value: unknown) => {
        setConfig((prev) => ({ ...prev, [key]: value }));
    };

    return (
        <Sheet open={isOpen} onOpenChange={onClose}>
            <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <span className="text-2xl">{definition.icon}</span>
                        {definition.label}
                    </SheetTitle>
                    <SheetDescription>{definition.description}</SheetDescription>
                </SheetHeader>

                <div className="space-y-6 mt-6">
                    {/* Node Label */}
                    <div>
                        <Label>Node Label</Label>
                        <Input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder={definition.label}
                        />
                    </div>

                    <Separator />

                    {/* Dynamic Configuration based on node type */}
                    {renderNodeConfig(definition.subType, config, updateConfig)}

                    <Separator />

                    {/* Actions */}
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function renderNodeConfig(subType: string, config: NodeConfig, updateConfig: (key: string, value: unknown) => void) {
    switch (subType) {
        // Trigger Nodes
        case 'keywords':
            return <KeywordsConfig config={config} updateConfig={updateConfig} />;
        case 'time':
            return <TimeConfig config={config} updateConfig={updateConfig} />;

        // Message Nodes
        case 'send-text':
            return <SendTextConfig config={config} updateConfig={updateConfig} />;
        case 'send-image':
            return <SendImageConfig config={config} updateConfig={updateConfig} />;
        case 'send-pdf':
            return <SendPDFConfig config={config} updateConfig={updateConfig} />;
        case 'send-video':
            return <SendVideoConfig config={config} updateConfig={updateConfig} />;
        case 'send-buttons':
            return <SendButtonsConfig config={config} updateConfig={updateConfig} />;
        case 'send-list':
            return <SendListConfig config={config} updateConfig={updateConfig} />;

        // Logic Nodes
        case 'branch':
            return <BranchConfig config={config} updateConfig={updateConfig} />;
        case 'counter':
            return <CounterConfig config={config} updateConfig={updateConfig} />;
        case 'delay':
            return <DelayConfig config={config} updateConfig={updateConfig} />;

        // AI Nodes
        case 'agentic':
            return <AIAgentConfig config={config} updateConfig={updateConfig} />;

        // Data Nodes
        case 'variables':
            return <VariablesConfig config={config} updateConfig={updateConfig} />;

        // API Nodes
        case 'http-request':
            return <HTTPRequestConfig config={config} updateConfig={updateConfig} />;
        case 'assign-agent':
            return <AssignAgentConfig config={config} updateConfig={updateConfig} />;

        default:
            return <div className="text-sm text-muted-foreground">No configuration available</div>;
    }
}

// Configuration Components

function KeywordsConfig({ config, updateConfig }: ConfigComponentProps) {
    const [newKeyword, setNewKeyword] = React.useState('');
    const keywords = (config.keywords as string[] | undefined) || [];

    const addKeyword = () => {
        if (newKeyword.trim()) {
            updateConfig('keywords', [...keywords, newKeyword.trim()]);
            setNewKeyword('');
        }
    };

    const removeKeyword = (index: number) => {
        const updated = [...keywords];
        updated.splice(index, 1);
        updateConfig('keywords', updated);
    };

    return (
        <div className="space-y-4">
            <div>
                <Label>Keywords</Label>
                <div className="flex gap-2 mt-2">
                    <Input
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Enter keyword"
                        onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                    />
                    <Button onClick={addKeyword} size="icon">
                        <Plus className="size-4" />
                    </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword: string, index: number) => (
                        <Badge key={keyword} variant="secondary" className="gap-1">
                            {keyword}
                            <X
                                className="size-3 cursor-pointer"
                                onClick={() => removeKeyword(index)}
                            />
                        </Badge>
                    ))}
                </div>
            </div>
            <div>
                <Label>Match Type</Label>
                <Select
                    value={(config.matchType as string) || 'contains'}
                    onValueChange={(value) => updateConfig('matchType', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="exact">Exact Match</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="regex">Regular Expression</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

function TimeConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Schedule (Cron Expression)</Label>
                <Input
                    value={(config.cronExpression as string) || '0 9 * * *'}
                    onChange={(e) => updateConfig('cronExpression', e.target.value)}
                    placeholder="0 9 * * *"
                />
                <p className="text-xs text-muted-foreground mt-1">
                    Example: &quot;0 9 * * *&quot; = Every day at 9:00 AM
                </p>
            </div>
            <div>
                <Label>Timezone</Label>
                <Input
                    value={(config.timezone as string) || 'UTC'}
                    onChange={(e) => updateConfig('timezone', e.target.value)}
                    placeholder="UTC"
                />
            </div>
        </div>
    );
}


function SendTextConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div>
            <MultilingualInput
                label="Message Text"
                value={(config.message as string) || ''}
                onChange={(value) => updateConfig('message', value)}
                placeholder="Enter your message..."
                rows={6}
            />
            <p className="text-xs text-muted-foreground mt-1">
                Use {'{'}variable{'}'} to insert variables
            </p>
        </div>
    );
}

function SendImageConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Image URL</Label>
                <Input
                    value={(config.imageUrl as string) || ''}
                    onChange={(e) => updateConfig('imageUrl', e.target.value)}
                    placeholder="https://example.com/image.jpg"
                />
            </div>
            <div>
                <Label>Caption (Optional)</Label>
                <Textarea
                    value={(config.caption as string) || ''}
                    onChange={(e) => updateConfig('caption', e.target.value)}
                    placeholder="Enter caption..."
                    rows={3}
                />
            </div>
        </div>
    );
}

function SendPDFConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>PDF URL</Label>
                <Input
                    value={(config.pdfUrl as string) || ''}
                    onChange={(e) => updateConfig('pdfUrl', e.target.value)}
                    placeholder="https://example.com/document.pdf"
                />
            </div>
            <div>
                <Label>Filename</Label>
                <Input
                    value={(config.filename as string) || 'document.pdf'}
                    onChange={(e) => updateConfig('filename', e.target.value)}
                    placeholder="document.pdf"
                />
            </div>
        </div>
    );
}

function SendVideoConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Video URL</Label>
                <Input
                    value={(config.videoUrl as string) || ''}
                    onChange={(e) => updateConfig('videoUrl', e.target.value)}
                    placeholder="https://example.com/video.mp4"
                />
            </div>
            <div>
                <Label>Caption (Optional)</Label>
                <Textarea
                    value={(config.caption as string) || ''}
                    onChange={(e) => updateConfig('caption', e.target.value)}
                    placeholder="Enter caption..."
                    rows={3}
                />
            </div>
        </div>
    );
}

interface WhatsAppButton {
    id: string;
    title: string;
}

function SendButtonsConfig({ config, updateConfig }: ConfigComponentProps) {
    const buttons: WhatsAppButton[] = (config.buttons as WhatsAppButton[] | undefined) || [{ id: '1', title: 'Button 1' }];

    const updateButton = (index: number, field: string, value: string) => {
        const updated = [...buttons];
        updated[index] = { ...updated[index], [field]: value };
        updateConfig('buttons', updated);
    };

    const addButton = () => {
        if (buttons.length < 3) {
            updateConfig('buttons', [...buttons, { id: String(buttons.length + 1), title: '' }]);
        }
    };

    const removeButton = (index: number) => {
        const updated = [...buttons];
        updated.splice(index, 1);
        updateConfig('buttons', updated);
    };

    return (
        <div className="space-y-4">
            <div>
                <Label>Message Text</Label>
                <Textarea
                    value={(config.text as string) || ''}
                    onChange={(e) => updateConfig('text', e.target.value)}
                    placeholder="Enter message text..."
                    rows={3}
                />
            </div>
            <div>
                <Label>Buttons (Max 3)</Label>
                {buttons.map((button: WhatsAppButton, index: number) => (
                    <div key={button.id} className="flex gap-2 mt-2">
                        <Input
                            value={button.title}
                            onChange={(e) => updateButton(index, 'title', e.target.value)}
                            placeholder={`Button ${index + 1}`}
                        />
                        {buttons.length > 1 && (
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => removeButton(index)}
                            >
                                <X className="size-4" />
                            </Button>
                        )}
                    </div>
                ))}
                {buttons.length < 3 && (
                    <Button variant="outline" size="sm" onClick={addButton} className="mt-2">
                        <Plus className="size-4 mr-2" />
                        Add Button
                    </Button>
                )}
            </div>
        </div>
    );
}

function SendListConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Header</Label>
                <Input
                    value={(config.header as string) || ''}
                    onChange={(e) => updateConfig('header', e.target.value)}
                    placeholder="Choose an option"
                />
            </div>
            <div>
                <Label>Body Text</Label>
                <Textarea
                    value={(config.body as string) || ''}
                    onChange={(e) => updateConfig('body', e.target.value)}
                    placeholder="Enter body text..."
                    rows={3}
                />
            </div>
            <div>
                <Label>Button Text</Label>
                <Input
                    value={(config.buttonText as string) || 'View Options'}
                    onChange={(e) => updateConfig('buttonText', e.target.value)}
                    placeholder="View Options"
                />
            </div>
        </div>
    );
}

function BranchConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Variable to Check</Label>
                <Input
                    value={(config.variable as string) || ''}
                    onChange={(e) => updateConfig('variable', e.target.value)}
                    placeholder="variable_name"
                />
            </div>
            <div>
                <Label>Operator</Label>
                <Select
                    value={(config.operator as string) || 'equals'}
                    onValueChange={(value) => updateConfig('operator', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="equals">Equals</SelectItem>
                        <SelectItem value="not_equals">Not Equals</SelectItem>
                        <SelectItem value="contains">Contains</SelectItem>
                        <SelectItem value="greater_than">Greater Than</SelectItem>
                        <SelectItem value="less_than">Less Than</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Value</Label>
                <Input
                    value={(config.value as string) || ''}
                    onChange={(e) => updateConfig('value', e.target.value)}
                    placeholder="comparison value"
                />
            </div>
        </div>
    );
}

function CounterConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Variable Name</Label>
                <Input
                    value={(config.variable as string) || 'counter'}
                    onChange={(e) => updateConfig('variable', e.target.value)}
                    placeholder="counter"
                />
            </div>
            <div>
                <Label>Operation</Label>
                <Select
                    value={(config.operation as string) || 'increment'}
                    onValueChange={(value) => updateConfig('operation', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="increment">Increment</SelectItem>
                        <SelectItem value="decrement">Decrement</SelectItem>
                        <SelectItem value="set">Set Value</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Value</Label>
                <Input
                    type="number"
                    value={(config.value as number) || 1}
                    onChange={(e) => updateConfig('value', parseInt(e.target.value))}
                />
            </div>
        </div>
    );
}

function DelayConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Duration</Label>
                <Input
                    type="number"
                    value={(config.duration as number) || 60}
                    onChange={(e) => updateConfig('duration', parseInt(e.target.value))}
                />
            </div>
            <div>
                <Label>Unit</Label>
                <Select
                    value={(config.unit as string) || 'seconds'}
                    onValueChange={(value) => updateConfig('unit', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="seconds">Seconds</SelectItem>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}

function AIAgentConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>System Prompt</Label>
                <Textarea
                    value={(config.systemPrompt as string) || ''}
                    onChange={(e) => updateConfig('systemPrompt', e.target.value)}
                    placeholder="You are a helpful customer service assistant..."
                    rows={4}
                />
            </div>
            <div>
                <Label>Model</Label>
                <Select
                    value={(config.model as string) || 'gpt-4'}
                    onValueChange={(value) => updateConfig('model', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="gpt-4">GPT-4</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        <SelectItem value="claude-3">Claude 3</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Temperature</Label>
                <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={(config.temperature as number) || 0.7}
                    onChange={(e) => updateConfig('temperature', parseFloat(e.target.value))}
                />
            </div>
        </div>
    );
}

function VariablesConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Variable Name</Label>
                <Input
                    value={(config.variableName as string) || ''}
                    onChange={(e) => updateConfig('variableName', e.target.value)}
                    placeholder="my_variable"
                />
            </div>
            <div>
                <Label>Value</Label>
                <Textarea
                    value={(config.value as string) || ''}
                    onChange={(e) => updateConfig('value', e.target.value)}
                    placeholder="Enter value..."
                    rows={3}
                />
            </div>
        </div>
    );
}

function HTTPRequestConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>URL</Label>
                <Input
                    value={(config.url as string) || ''}
                    onChange={(e) => updateConfig('url', e.target.value)}
                    placeholder="https://api.example.com/endpoint"
                />
            </div>
            <div>
                <Label>Method</Label>
                <Select
                    value={(config.method as string) || 'GET'}
                    onValueChange={(value) => updateConfig('method', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="GET">GET</SelectItem>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Request Body (JSON)</Label>
                <Textarea
                    value={(config.body as string) || ''}
                    onChange={(e) => updateConfig('body', e.target.value)}
                    placeholder='{"key": "value"}'
                    rows={4}
                />
            </div>
        </div>
    );
}

function AssignAgentConfig({ config, updateConfig }: ConfigComponentProps) {
    return (
        <div className="space-y-4">
            <div>
                <Label>Agent ID</Label>
                <Input
                    value={(config.agentId as string) || ''}
                    onChange={(e) => updateConfig('agentId', e.target.value)}
                    placeholder="agent_id"
                />
            </div>
            <div>
                <Label>Priority</Label>
                <Select
                    value={(config.priority as string) || 'normal'}
                    onValueChange={(value) => updateConfig('priority', value)}
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
                <Label>Note</Label>
                <Textarea
                    value={(config.note as string) || ''}
                    onChange={(e) => updateConfig('note', e.target.value)}
                    placeholder="Add a note for the agent..."
                    rows={3}
                />
            </div>
        </div>
    );
}

// Helper function to generate preview text
function generatePreview(subType: string, config: NodeConfig): string {
    switch (subType) {
        case 'send-text':
            return (config.message as string | undefined)?.substring(0, 50) || 'No message';
        case 'send-image':
            return (config.imageUrl as string) || 'No image URL';
        case 'keywords':
            return ((config.keywords as string[] | undefined) || []).join(', ') || 'No keywords';
        case 'branch':
            return `${config.variable} ${config.operator} ${config.value}`;
        case 'delay':
            return `${config.duration} ${config.unit}`;
        default:
            return '';
    }
}
