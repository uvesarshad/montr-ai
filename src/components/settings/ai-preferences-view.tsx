'use client';

import { useState, useEffect } from 'react';
import { Button, Card, Chip, Select, SettingRow, Spinner } from '@/components/ui-kit';
import type { SelectOptionGroup } from '@/components/ui-kit';
import { useToast } from '@/hooks/use-toast';
import { BrainCircuit } from 'lucide-react';

interface AIPreference {
    modelId: string;
    providerId: string;
}

interface AIPreferencesViewProps {
    isAdmin?: boolean;
}

// Types from API
interface AIModelGroup {
    provider: string; // This matches providerName in backend
    models: { id: string; name: string }[];
}

interface AITask {
    id: string;
    label: string;
    description: string;
    defaultModel: string;
}

export function AIPreferencesView({ isAdmin = false }: AIPreferencesViewProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preferences, setPreferences] = useState<Record<string, AIPreference>>({});

    // State for dynamic data
    const [availableModels, setAvailableModels] = useState<AIModelGroup[]>([]);
    const [aiTasks, setAiTasks] = useState<AITask[]>([]);

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Models & Tasks
            const modelsRes = await fetch('/api/v2/ai/models');
            if (!modelsRes.ok) throw new Error('Failed to load models');
            const { models, tasks } = await modelsRes.json();
            setAvailableModels(models);
            setAiTasks(tasks);

            // 2. Fetch Preferences
            if (isAdmin) {
                // Fetch system defaults
                const res = await fetch('/api/v2/admin/system-settings');
                if (res.ok) {
                    const data = await res.json();
                    setPreferences(data);
                }
            } else {
                // Fetch user preferences AND system defaults to show as fallback
                const [userRes] = await Promise.all([
                    fetch('/api/v2/users/me'),
                ]);

                if (userRes.ok) {
                    const userData = await userRes.json();
                    setPreferences(userData.aiPreferences || {});
                }
            }
        } catch (error) {
            console.error('Failed to load data', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to load AI settings.' });
        } finally {
            setLoading(false);
        }
    };

    const handleModelChange = (taskId: string, modelId: string) => {
        // Find provider
        let providerId = 'unknown';

        for (const group of availableModels) {
            const model = group.models.find((m) => m.id === modelId);
            if (model) {
                // @ts-expect-error
                providerId = model.provider || group.provider.toLowerCase();
                // Note: Backend might define provider on group or model.
                // Our getModelsByProvider returns { provider: "Google", models: [...] }.
                // So group.provider is "Google". We want "google".
                break;
            }
        }

        setPreferences(prev => ({
            ...prev,
            [taskId]: { modelId, providerId }
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const endpoint = isAdmin ? '/api/v2/admin/system-settings' : '/api/v2/users/me';
            const body = isAdmin ? preferences : { aiPreferences: preferences };
            const method = isAdmin ? 'POST' : 'PATCH';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error('Failed to save');

            toast({
                title: isAdmin ? 'Defaults Saved' : 'Preferences Saved',
                description: isAdmin ? 'System-wide AI defaults have been updated.' : 'Your AI preferences have been updated.',
            });
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-8"><Spinner size={24} /></div>;
    }

    return (
        <div className="space-y-3">
            <div>
                <h3 className="text-[13px] font-semibold">{isAdmin ? 'System AI Defaults' : 'AI Preferences'}</h3>
                <p className="text-[12px] text-muted-foreground">
                    {isAdmin
                        ? 'Set the default AI models for various system tasks. Users can override these in their personal settings.'
                        : 'Customize which AI models are used for specific tasks. Leave as "Default" to use system settings.'}
                </p>
            </div>

            <Card
                icon={BrainCircuit}
                title="Task Models"
                bodyClassName="px-4 pb-4 divide-y divide-border/60"
                footer={
                    <div className="flex w-full justify-end">
                        <Button variant="primary" onClick={handleSave} disabled={saving}>
                            {saving ? <><Spinner size={13} className="border-current" /> Saving...</> : 'Save Changes'}
                        </Button>
                    </div>
                }
            >
                {aiTasks.map((task) => {
                    const currentPref = preferences[task.id];

                    const modelGroups: SelectOptionGroup[] = [
                        ...(!isAdmin
                            ? [{
                                label: 'Default',
                                options: [{ value: 'default', label: <span className="text-muted-foreground">System Default</span> }],
                            }]
                            : []),
                        ...availableModels.map((group) => ({
                            label: group.provider,
                            options: group.models.map((model) => ({ value: model.id, label: model.name })),
                        })),
                    ];

                    return (
                        <SettingRow
                            key={task.id}
                            label={
                                <span className="flex items-center gap-2">
                                    {task.label}
                                    {!isAdmin && currentPref && <Chip tone="brand">Customized</Chip>}
                                </span>
                            }
                            description={task.description}
                        >
                            <div className="w-full sm:w-[250px]">
                                <Select
                                    options={modelGroups}
                                    placeholder="Select a model"
                                    value={currentPref?.modelId || (isAdmin ? task.defaultModel : 'default')}
                                    onChange={(val) => {
                                        if (val === 'default') {
                                            const newPrefs = { ...preferences };
                                            delete newPrefs[task.id];
                                            setPreferences(newPrefs);
                                        } else {
                                            handleModelChange(task.id, val);
                                        }
                                    }}
                                    triggerClassName="w-full"
                                />
                            </div>
                        </SettingRow>
                    );
                })}
            </Card>
        </div>
    );
}
