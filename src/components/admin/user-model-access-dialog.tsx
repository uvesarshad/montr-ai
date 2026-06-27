'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Button,
    Input,
    Chip,
    Spinner,
    Field,
    FormDialog,
} from '@/components/ui-kit';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, RotateCcw } from 'lucide-react';

interface UserModelAccessDialogProps {
    user: {
        _id: string;
        name?: string;
        email?: string;
        planId?: string;
    } | null;
    planName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

interface CustomLimits {
    allowedModelTiers: string[];
    allowedModelTypes: string[];
    monthlyCredits: number | null;
    disabledModels: string[];
    enabledModels: string[];
    byokProviders: string[];
}

const MODEL_TIERS = [
    { value: 'free', label: 'Free', description: 'Basic models' },
    { value: 'pro', label: 'Pro', description: 'Advanced models' },
    { value: 'enterprise', label: 'Enterprise', description: 'Premium models' },
];

const MODEL_TYPES = [
    { value: 'text', label: 'Text Generation' },
    { value: 'image', label: 'Image Generation' },
    { value: 'video', label: 'Video Generation' },
];

const BYOK_PROVIDERS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google' },
    { value: 'xai', label: 'xAI' },
    { value: 'deepseek', label: 'DeepSeek' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'cohere', label: 'Cohere' },
    { value: 'groq', label: 'Groq' },
    { value: 'openrouter', label: 'OpenRouter' },
];

interface ModelOption {
    value: string;
    label: string;
    description?: string;
}

function ModelOptionGrid({
    options,
    selected,
    onToggle,
    padding,
}: {
    options: ModelOption[];
    selected: string[];
    onToggle: (value: string) => void;
    padding: 'p-2' | 'p-3';
}) {
    return (
        <>
            {options.map(option => (
                <div
                    key={option.value}
                    role="button"
                    tabIndex={0}
                    className={`flex items-center space-x-2 ${padding} rounded-xl border cursor-pointer transition-colors ${selected.includes(option.value)
                            ? 'border-brand bg-accent/30'
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                    onClick={() => onToggle(option.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(option.value); } }}
                >
                    <Checkbox
                        checked={selected.includes(option.value)}
                        onCheckedChange={() => onToggle(option.value)}
                    />
                    {option.description !== undefined ? (
                        <div>
                            <div className="font-medium text-sm">{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                    ) : (
                        <span className="text-sm">{option.label}</span>
                    )}
                </div>
            ))}
        </>
    );
}

export function UserModelAccessDialog({
    user,
    planName,
    open,
    onOpenChange,
    onSuccess,
}: UserModelAccessDialogProps) {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [customLimits, setCustomLimits] = useState<CustomLimits>({
        allowedModelTiers: [],
        allowedModelTypes: [],
        monthlyCredits: null,
        disabledModels: [],
        enabledModels: [],
        byokProviders: [],
    });
    const [hasOverrides, setHasOverrides] = useState(false);

    const fetchUserAccess = useCallback(async () => {
        if (!user?._id) return;

        setIsLoading(true);
        try {
            const response = await fetch(`/api/v2/admin/users/${user._id}/model-access`);
            if (!response.ok) throw new Error('Failed to fetch');

            const data = await response.json();
            const limits = data.customLimits || {};

            setCustomLimits({
                allowedModelTiers: limits.allowedModelTiers || [],
                allowedModelTypes: limits.allowedModelTypes || [],
                monthlyCredits: limits.monthlyCredits || null,
                disabledModels: limits.disabledModels || [],
                enabledModels: limits.enabledModels || [],
                byokProviders: limits.byokProviders || [],
            });

            // Check if user has any overrides
            setHasOverrides(Object.values(limits).some((v: unknown) =>
                v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== null)
            ));
        } catch (error) {
            console.error('Error fetching user access:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to load user access settings',
            });
        } finally {
            setIsLoading(false);
        }
    }, [user?._id, toast]);

    // Fetch current settings when dialog opens
    useEffect(() => {
        if (open && user?._id) {
            fetchUserAccess();
        }
    }, [open, user?._id, fetchUserAccess]);

    const handleSave = async () => {
        if (!user?._id) return;

        setIsSaving(true);
        try {
            const response = await fetch(`/api/v2/admin/users/${user._id}/model-access`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customLimits),
            });

            if (!response.ok) throw new Error('Failed to save');

            toast({
                title: 'Access Updated',
                description: `Model access settings saved for ${user.name || user.email}`,
            });

            onSuccess?.();
            onOpenChange(false);
        } catch (error) {
            console.error('Error saving user access:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to save access settings',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (!user?._id) return;

        setIsSaving(true);
        try {
            const response = await fetch(`/api/v2/admin/users/${user._id}/model-access`, {
                method: 'DELETE',
            });

            if (!response.ok) throw new Error('Failed to reset');

            setCustomLimits({
                allowedModelTiers: [],
                allowedModelTypes: [],
                monthlyCredits: null,
                disabledModels: [],
                enabledModels: [],
                byokProviders: [],
            });
            setHasOverrides(false);

            toast({
                title: 'Reset to Defaults',
                description: `${user.name || user.email} will now use plan defaults`,
            });

            onSuccess?.();
        } catch (error) {
            console.error('Error resetting user access:', error);
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'Failed to reset access settings',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleTier = (tier: string) => {
        setCustomLimits(prev => ({
            ...prev,
            allowedModelTiers: prev.allowedModelTiers.includes(tier)
                ? prev.allowedModelTiers.filter(t => t !== tier)
                : [...prev.allowedModelTiers, tier],
        }));
    };

    const toggleType = (type: string) => {
        setCustomLimits(prev => ({
            ...prev,
            allowedModelTypes: prev.allowedModelTypes.includes(type)
                ? prev.allowedModelTypes.filter(t => t !== type)
                : [...prev.allowedModelTypes, type],
        }));
    };

    const toggleProvider = (provider: string) => {
        setCustomLimits(prev => ({
            ...prev,
            byokProviders: prev.byokProviders.includes(provider)
                ? prev.byokProviders.filter(p => p !== provider)
                : [...prev.byokProviders, provider],
        }));
    };

    if (!user) return null;

    return (
        <FormDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Model Access Settings"
            icon={Sparkles}
            size="lg"
            submitLabel="Save Changes"
            submitting={isSaving}
            onSubmit={handleSave}
            closeOnSuccess={false}
        >
            <div className="space-y-1 mb-4">
                <p className="text-sm text-muted-foreground">
                    Configure custom model access for{' '}
                    <strong className="text-foreground">{user.name || user.email}</strong>.
                    {planName && (
                        <span className="ml-1">
                            Current plan: <Chip tone="info">{planName}</Chip>
                        </span>
                    )}
                </p>
                {hasOverrides && (
                    <div className="flex items-center justify-between pt-1">
                        <Chip tone="warn">Has custom overrides</Chip>
                        <Button
                            variant="ghost"
                            size="sm"
                            icon={RotateCcw}
                            onClick={handleReset}
                            disabled={isSaving}
                        >
                            Reset to Defaults
                        </Button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Spinner size={24} />
                </div>
            ) : (
                <ScrollArea className="max-h-[50vh] pr-4">
                    <div className="space-y-6">
                        {/* Model Tiers */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Allowed Model Tiers</span>
                                {customLimits.allowedModelTiers.length === 0 && (
                                    <Chip tone="gray">Using plan default</Chip>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <ModelOptionGrid
                                    options={MODEL_TIERS}
                                    selected={customLimits.allowedModelTiers}
                                    onToggle={toggleTier}
                                    padding="p-3"
                                />
                            </div>
                        </div>

                        <Separator />

                        {/* Model Types */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Allowed Model Types</span>
                                {customLimits.allowedModelTypes.length === 0 && (
                                    <Chip tone="gray">Using plan default</Chip>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <ModelOptionGrid
                                    options={MODEL_TYPES}
                                    selected={customLimits.allowedModelTypes}
                                    onToggle={toggleType}
                                    padding="p-3"
                                />
                            </div>
                        </div>

                        <Separator />

                        {/* Monthly Credits */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Monthly Credit Allocation</span>
                                {!customLimits.monthlyCredits && (
                                    <Chip tone="gray">Using plan default</Chip>
                                )}
                            </div>
                            <Field label="">
                                <div className="flex items-center gap-3">
                                    <Input
                                        type="number"
                                        placeholder="Leave empty for plan default"
                                        value={customLimits.monthlyCredits || ''}
                                        onChange={(e) => setCustomLimits(prev => ({
                                            ...prev,
                                            monthlyCredits: e.target.value ? parseInt(e.target.value) : null,
                                        }))}
                                        wrapClassName="w-48"
                                    />
                                    <span className="text-sm text-muted-foreground">credits per month</span>
                                </div>
                            </Field>
                        </div>

                        <Separator />

                        {/* BYOK Providers */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Allowed BYOK Providers</span>
                                {customLimits.byokProviders.length === 0 && (
                                    <Chip tone="gray">Using plan default</Chip>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <ModelOptionGrid
                                    options={BYOK_PROVIDERS}
                                    selected={customLimits.byokProviders}
                                    onToggle={toggleProvider}
                                    padding="p-2"
                                />
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            )}
        </FormDialog>
    );
}
