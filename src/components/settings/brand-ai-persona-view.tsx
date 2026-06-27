'use client';

import { useState, useEffect } from 'react';
import {
    Button,
    Card,
    Chip,
    Field,
    Input,
    Textarea,
    Select,
    SettingRow,
    Skeleton,
    Spinner,
} from '@/components/ui-kit';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Bot, Shield, Plus, X } from 'lucide-react';

interface BrandOption {
    _id: string;
    name: string;
}

interface BrandContextData {
    agentName: string;
    personality: string;
    tone: string;
    languageStyle: string;
    customInstructions: string;
    brandVoice: string;
    targetAudience: string;
    competitors: string[];
    keyMessages: string[];
    industry: string;
    enabledTools: string[];
    requireApproval: string[];
    maxBudgetPerSession: number;
}

const ALL_TOOLS = [
    { id: 'createContact', label: 'Create Contact', description: 'Create CRM contacts' },
    { id: 'getContact', label: 'Search Contacts', description: 'Search CRM contacts' },
    { id: 'searchKnowledgeBase', label: 'Search Knowledge Base', description: 'Search brand memory' },
    { id: 'triggerWorkflow', label: 'Trigger Workflow', description: 'Execute automated workflows' },
    // Future tools — will be enabled as they're built
    { id: 'sendEmail', label: 'Send Email', description: 'Send emails to contacts' },
    { id: 'sendWhatsApp', label: 'Send WhatsApp', description: 'Send WhatsApp messages' },
    { id: 'schedulePost', label: 'Schedule Post', description: 'Schedule social media posts' },
    { id: 'createDeal', label: 'Create Deal', description: 'Create CRM deals' },
];

const TONE_OPTIONS = [
    'Professional', 'Friendly', 'Casual', 'Authoritative', 'Warm', 'Witty', 'Empathetic', 'Direct',
];

interface ToolPermissionsCardProps {
    enabledTools: string[];
    requireApproval: string[];
    isSaving: boolean;
    onToggleTool: (toolId: string) => void;
    onToggleApproval: (toolId: string) => void;
    onSave: () => void;
}

function ToolPermissionsCard({
    enabledTools,
    requireApproval,
    isSaving,
    onToggleTool,
    onToggleApproval,
    onSave,
}: ToolPermissionsCardProps) {
    return (
        <Card
            icon={Shield}
            title="Tool Permissions"
            meta="control which actions need approval"
            bodyClassName="px-4 pb-4 divide-y divide-border/60"
            footer={
                <div className="flex w-full justify-end">
                    <Button variant="primary" onClick={onSave} disabled={isSaving}>
                        {isSaving ? <><Spinner size={13} className="border-current" /> Saving...</> : 'Save AI Persona'}
                    </Button>
                </div>
            }
        >
            {ALL_TOOLS.map(tool => (
                <SettingRow key={tool.id} label={tool.label} description={tool.description}>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Enabled
                            <Switch
                                checked={enabledTools.includes(tool.id)}
                                onCheckedChange={() => onToggleTool(tool.id)}
                            />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            Approval
                            <Switch
                                checked={requireApproval.includes(tool.id)}
                                onCheckedChange={() => onToggleApproval(tool.id)}
                                disabled={!enabledTools.includes(tool.id)}
                            />
                        </label>
                    </div>
                </SettingRow>
            ))}
        </Card>
    );
}

export function BrandAIPersonaView() {
    const { toast } = useToast();
    const [brands, setBrands] = useState<BrandOption[]>([]);
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [context, setContext] = useState<BrandContextData>({
        agentName: 'MontrAI Agent',
        personality: 'You are a professional, proactive, and friendly marketing assistant.',
        tone: 'Professional',
        languageStyle: 'Clear and concise',
        customInstructions: '',
        brandVoice: '',
        targetAudience: '',
        competitors: [],
        keyMessages: [],
        industry: '',
        enabledTools: ['createContact', 'getContact', 'searchKnowledgeBase', 'triggerWorkflow'],
        requireApproval: [],
        maxBudgetPerSession: 100,
    });

    const [newCompetitor, setNewCompetitor] = useState('');
    const [newKeyMessage, setNewKeyMessage] = useState('');

    // Fetch brands
    useEffect(() => {
        fetch('/api/social/brands')
            .then(res => res.ok ? res.json() : [])
            .then((data: BrandOption[]) => {
                setBrands(data || []);
                if (data?.length > 0 && !selectedBrandId) {
                    setSelectedBrandId(data[0]._id);
                }
                setIsLoading(false);
            })
            .catch(() => setIsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch brand context when brand changes
    useEffect(() => {
        if (!selectedBrandId) return;
        setIsLoading(true);
        fetch(`/api/v2/brands/${selectedBrandId}/context`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to fetch');
                return res.json();
            })
            .then((data: BrandContextData) => {
                setContext({
                    agentName: data.agentName || 'MontrAI Agent',
                    personality: data.personality || '',
                    tone: data.tone || 'Professional',
                    languageStyle: data.languageStyle || 'Clear and concise',
                    customInstructions: data.customInstructions || '',
                    brandVoice: data.brandVoice || '',
                    targetAudience: data.targetAudience || '',
                    competitors: data.competitors || [],
                    keyMessages: data.keyMessages || [],
                    industry: data.industry || '',
                    enabledTools: data.enabledTools || [],
                    requireApproval: data.requireApproval || [],
                    maxBudgetPerSession: data.maxBudgetPerSession || 100,
                });
                setIsLoading(false);
            })
            .catch(() => {
                setIsLoading(false);
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to load AI persona settings.' });
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBrandId]);

    const handleSave = async () => {
        if (!selectedBrandId) return;
        setIsSaving(true);
        try {
            const res = await fetch(`/api/v2/brands/${selectedBrandId}/context`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(context),
            });
            if (!res.ok) throw new Error('Failed to save');
            toast({ title: 'AI Persona Saved', description: 'Your Agent persona settings have been updated.' });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to save AI persona settings.' });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleTool = (toolId: string) => {
        setContext(prev => ({
            ...prev,
            enabledTools: prev.enabledTools.includes(toolId)
                ? prev.enabledTools.filter(t => t !== toolId)
                : [...prev.enabledTools, toolId],
        }));
    };

    const toggleApproval = (toolId: string) => {
        setContext(prev => ({
            ...prev,
            requireApproval: prev.requireApproval.includes(toolId)
                ? prev.requireApproval.filter(t => t !== toolId)
                : [...prev.requireApproval, toolId],
        }));
    };

    const addCompetitor = () => {
        if (!newCompetitor.trim()) return;
        setContext(prev => ({ ...prev, competitors: [...prev.competitors, newCompetitor.trim()] }));
        setNewCompetitor('');
    };

    const removeCompetitor = (index: number) => {
        setContext(prev => ({ ...prev, competitors: prev.competitors.filter((_, i) => i !== index) }));
    };

    const addKeyMessage = () => {
        if (!newKeyMessage.trim()) return;
        setContext(prev => ({ ...prev, keyMessages: [...prev.keyMessages, newKeyMessage.trim()] }));
        setNewKeyMessage('');
    };

    const removeKeyMessage = (index: number) => {
        setContext(prev => ({ ...prev, keyMessages: prev.keyMessages.filter((_, i) => i !== index) }));
    };

    if (isLoading && brands.length === 0) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-[300px] w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-[13px] font-semibold">AI Persona</h3>
                <p className="text-[12px] text-muted-foreground">
                    Configure how the Agent behaves for each brand — its personality, knowledge, and tool permissions.
                </p>
            </div>

            {/* Brand Selector */}
            {brands.length > 1 && (
                <Field label="Select Brand" className="max-w-[260px]">
                    <Select
                        value={selectedBrandId}
                        onChange={setSelectedBrandId}
                        placeholder="Choose a brand"
                        options={brands.map(b => ({ value: b._id, label: b.name }))}
                    />
                </Field>
            )}

            {isLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-[200px]" />
                    <Skeleton className="h-[200px]" />
                </div>
            ) : (
                <>
                    {/* SOUL — Agent Identity */}
                    <Card icon={Bot} title="Agent Identity" meta="name, personality, communication style" bodyClassName="px-4 pb-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Agent Name" htmlFor="agentName">
                                <Input
                                    id="agentName"
                                    value={context.agentName}
                                    onChange={e => setContext(prev => ({ ...prev, agentName: e.target.value }))}
                                    placeholder="e.g. Luna, Alex, Brand Agent"
                                />
                            </Field>
                            <Field label="Tone" htmlFor="tone">
                                <Select
                                    value={context.tone}
                                    onChange={val => setContext(prev => ({ ...prev, tone: val }))}
                                    options={TONE_OPTIONS.map(t => ({ value: t, label: t }))}
                                />
                            </Field>
                        </div>

                        <Field label="Personality" htmlFor="personality">
                            <Textarea
                                id="personality"
                                value={context.personality}
                                onChange={e => setContext(prev => ({ ...prev, personality: e.target.value }))}
                                placeholder="Describe the AI's personality and how it should respond..."
                                rows={3}
                            />
                        </Field>

                        <Field label="Language Style" htmlFor="languageStyle">
                            <Input
                                id="languageStyle"
                                value={context.languageStyle}
                                onChange={e => setContext(prev => ({ ...prev, languageStyle: e.target.value }))}
                                placeholder="e.g. Clear and concise, Use marketing jargon, Short sentences"
                            />
                        </Field>

                        <Field label="Custom Instructions" htmlFor="customInstructions">
                            <Textarea
                                id="customInstructions"
                                value={context.customInstructions}
                                onChange={e => setContext(prev => ({ ...prev, customInstructions: e.target.value }))}
                                placeholder="Any special instructions the AI should always follow..."
                                rows={3}
                            />
                        </Field>
                    </Card>

                    {/* CONTEXT — Brand Knowledge */}
                    <Card icon={Sparkles} title="Brand Knowledge" meta="context that shapes every response" bodyClassName="px-4 pb-4 space-y-4">
                        <Field label="Brand Voice" htmlFor="brandVoice">
                            <Textarea
                                id="brandVoice"
                                value={context.brandVoice}
                                onChange={e => setContext(prev => ({ ...prev, brandVoice: e.target.value }))}
                                placeholder="Describe your brand identity, values, and voice..."
                                rows={3}
                            />
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Target Audience" htmlFor="targetAudience">
                                <Input
                                    id="targetAudience"
                                    value={context.targetAudience}
                                    onChange={e => setContext(prev => ({ ...prev, targetAudience: e.target.value }))}
                                    placeholder="e.g. 25-40 year old professionals"
                                />
                            </Field>
                            <Field label="Industry" htmlFor="industry">
                                <Input
                                    id="industry"
                                    value={context.industry}
                                    onChange={e => setContext(prev => ({ ...prev, industry: e.target.value }))}
                                    placeholder="e.g. SaaS, Fashion, Restaurant"
                                />
                            </Field>
                        </div>

                        {/* Competitors */}
                        <Field label="Competitors">
                            <div className="flex gap-2">
                                <Input
                                    value={newCompetitor}
                                    onChange={e => setNewCompetitor(e.target.value)}
                                    placeholder="Add a competitor..."
                                    wrapClassName="flex-1"
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
                                />
                                <Button type="button" variant="outline" icon={Plus} onClick={addCompetitor}>Add</Button>
                            </div>
                            {context.competitors.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {context.competitors.map((c, i) => (
                                        <Chip key={`${c}-${i}`} tone="gray">
                                            {c}
                                            <button type="button" onClick={() => removeCompetitor(i)} className="ml-0.5 opacity-70 hover:opacity-100">
                                                <X className="size-3" />
                                            </button>
                                        </Chip>
                                    ))}
                                </div>
                            )}
                        </Field>

                        {/* Key Messages */}
                        <Field label="Key Messages">
                            <div className="flex gap-2">
                                <Input
                                    value={newKeyMessage}
                                    onChange={e => setNewKeyMessage(e.target.value)}
                                    placeholder="Add a key message or value proposition..."
                                    wrapClassName="flex-1"
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyMessage())}
                                />
                                <Button type="button" variant="outline" icon={Plus} onClick={addKeyMessage}>Add</Button>
                            </div>
                            {context.keyMessages.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {context.keyMessages.map((m, i) => (
                                        <Chip key={`${m}-${i}`} tone="gray">
                                            {m}
                                            <button type="button" onClick={() => removeKeyMessage(i)} className="ml-0.5 opacity-70 hover:opacity-100">
                                                <X className="size-3" />
                                            </button>
                                        </Chip>
                                    ))}
                                </div>
                            )}
                        </Field>
                    </Card>

                    {/* TOOLS — Permissions */}
                    <ToolPermissionsCard
                        enabledTools={context.enabledTools}
                        requireApproval={context.requireApproval}
                        isSaving={isSaving}
                        onToggleTool={toggleTool}
                        onToggleApproval={toggleApproval}
                        onSave={handleSave}
                    />
                </>
            )}
        </div>
    );
}
