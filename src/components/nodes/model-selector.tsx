'use client';

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Sparkles, Zap, Crown, Key, Brain, Flame, Bot, Cpu, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export interface ModelOption {
    id: string;
    name: string;
    provider: string;
    type?: 'text' | 'image' | 'video';
    creditCost?: number;
    badge?: string | null;
    isDisabled?: boolean;
    isAvailable?: boolean;
    usingByok?: boolean;
    disabledReason?: 'upgrade_plan' | 'add_api_key' | 'insufficient_credits' | null;
    routeHint?: {
        sdk: string;
        provider: string;
        keySource: string;
    } | null;
    isCustom?: boolean;
    capabilities?: string[];
}

export interface ModelGroup {
    label: string;
    models: ModelOption[];
}

interface ModelSelectorProps {
    value?: string;
    onValueChange: (value: string, model: ModelOption) => void;
    modelType?: 'text' | 'image' | 'video' | 'all';
    className?: string;
    triggerClassName?: string;
    disabled?: boolean;
}

const getProviderIcon = (provider: string) => {
    switch (provider.toLowerCase()) {
        case 'openai':
            return <Sparkles className="size-3" />;
        case 'google':
            return <Zap className="size-3" />;
        case 'anthropic':
            return <Crown className="size-3" />;
        case 'xai':
            return <Brain className="size-3" />;
        case 'deepseek':
            return <Flame className="size-3" />;
        case 'mistral':
            return <Bot className="size-3" />;
        case 'groq':
            return <Cpu className="size-3" />;
        case 'openrouter':
            return <Globe className="size-3" />;
        default:
            return <Sparkles className="size-3" />;
    }
};

const getBadgeVariant = (badge?: string | null) => {
    if (!badge) return null;
    const lower = badge.toLowerCase();
    if (lower === 'pro' || lower === 'premium') {
        return 'bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0';
    }
    if (lower === 'enterprise') {
        return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0';
    }
    if (lower === 'custom') {
        return 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0';
    }
    if (lower === 'new') {
        return 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0';
    }
    if (lower === 'beta') {
        return 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0';
    }
    return 'bg-muted text-muted-foreground';
};

const getTooltipContent = (reason: string | null | undefined) => {
    if (reason === 'upgrade_plan') {
        return (
            <p>
                <Link href="/settings/billing" className="underline">Upgrade your plan</Link> to use this model.
            </p>
        );
    }
    if (reason === 'add_api_key') {
        return (
            <p>
                <Link href="/settings" className="underline">Add your API key</Link> in settings to use this model.
            </p>
        );
    }
    if (reason === 'insufficient_credits') {
        return (
            <p>
                You don&apos;t have enough credits. <Link href="/settings/billing" className="underline">Add more credits</Link>.
            </p>
        );
    }
    return 'This model is not available.';
};

export const ModelSelector = ({
    value,
    onValueChange,
    modelType = 'text',
    className: _className,
    triggerClassName,
    disabled = false,
}: ModelSelectorProps) => {
    const [models, setModels] = useState<ModelGroup[]>([]);
    const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [remainingCredits, setRemainingCredits] = useState<number | null>(null);

    useEffect(() => {
        async function fetchModels() {
            try {
                // Fetch with type parameter for server-side filtering
                const url = modelType !== 'all'
                    ? `/api/ai/models?type=${modelType}`
                    : '/api/ai/models';
                const response = await fetch(url);
                if (!response.ok) throw new Error('Failed to fetch models');
                const data = await response.json();

                // Handle new API response format
                const modelsData = data.models || data;
                setRemainingCredits(data.remainingCredits ?? null);

                // Filter out empty groups
                const filteredModels = modelsData.filter((group: ModelGroup) => group.models.length > 0);
                setModels(filteredModels);

                // Set initial selection
                if (value) {
                    const foundModel = filteredModels.flatMap((g: ModelGroup) => g.models).find((m: ModelOption) => m.id === value);
                    setSelectedModel(foundModel || null);
                } else {
                    const defaultModel = filteredModels.flatMap((g: ModelGroup) => g.models).find((m: ModelOption) => !m.isDisabled);
                    if (defaultModel) {
                        setSelectedModel(defaultModel);
                        onValueChange(defaultModel.id, defaultModel);
                    }
                }
            } catch (error) {
                console.error("Failed to load models:", error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelType]);

    // Sync with external value changes
    useEffect(() => {
        if (value && models.length > 0) {
            const foundModel = models.flatMap(g => g.models).find(m => m.id === value);
            if (foundModel && foundModel.id !== selectedModel?.id) {
                setSelectedModel(foundModel);
            }
        }
    }, [value, models, selectedModel]);

    const handleChange = (newValue: string) => {
        const model = models.flatMap(g => g.models).find(m => m.id === newValue);
        if (model) {
            setSelectedModel(model);
            onValueChange(newValue, model);
        }
    };

    return (
        <Select value={selectedModel?.id} onValueChange={handleChange} disabled={disabled || isLoading}>
            <SelectTrigger
                className={cn(
                    "h-9 gap-2 border border-border/50 shadow-sm bg-background/80 backdrop-blur-sm",
                    "hover:bg-muted/50 hover:border-border focus:ring-1 focus:ring-primary/20",
                    "rounded-full px-3 text-sm font-medium transition-all",
                    triggerClassName
                )}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedModel && (
                        <div className="size-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {getProviderIcon(selectedModel.provider)}
                        </div>
                    )}
                    <span className="truncate">
                        {isLoading ? 'Loading...' : (selectedModel?.name || 'Select Model')}
                    </span>
                    {/* BYOK Indicator */}
                    {selectedModel?.usingByok && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Key className="size-3 text-amber-500 shrink-0" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Using your API key</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                {selectedModel?.badge && (
                    <Badge className={cn("h-5 px-1.5 text-[10px] font-semibold shrink-0", getBadgeVariant(selectedModel.badge))}>
                        {selectedModel.badge}
                    </Badge>
                )}
            </SelectTrigger>
            <SelectContent className="min-w-[320px] p-1 rounded-xl border shadow-lg">
                <TooltipProvider>
                    {/* Credit display */}
                    {remainingCredits !== null && (
                        <div className="px-3 py-2 text-xs text-muted-foreground border-b mb-1">
                            <span className="font-medium">{remainingCredits}</span> credits remaining
                        </div>
                    )}

                    {models.map(group => (
                        <SelectGroup key={group.label}>
                            <SelectLabel className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                {group.label}
                            </SelectLabel>
                            {group.models.map((option) => (
                                <Tooltip key={option.id} delayDuration={300}>
                                    <TooltipTrigger asChild>
                                        <div>
                                            <SelectItem
                                                value={option.id}
                                                disabled={option.isDisabled}
                                                className={cn(
                                                    "rounded-lg cursor-pointer transition-colors",
                                                    "focus:bg-primary/10 focus:text-primary",
                                                    option.isDisabled && "opacity-50 cursor-not-allowed"
                                                )}
                                            >
                                                <div className="flex items-center justify-between w-full gap-3">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="size-6 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                                                            {getProviderIcon(option.provider)}
                                                        </div>
                                                        <span className="truncate font-medium">{option.name}</span>
                                                        {/* BYOK indicator in dropdown */}
                                                        {option.usingByok && (
                                                            <Key className="size-3 text-amber-500 shrink-0" />
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {/* Credit cost */}
                                                        {option.creditCost !== undefined && (
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {option.creditCost} cr
                                                            </span>
                                                        )}
                                                        {option.badge && (
                                                            <Badge className={cn("h-5 px-1.5 text-[10px] font-semibold", getBadgeVariant(option.badge))}>
                                                                {option.badge}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        </div>
                                    </TooltipTrigger>
                                    {option.isDisabled && (
                                        <TooltipContent side="right" className="max-w-[200px]">
                                            {getTooltipContent(option.disabledReason)}
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            ))}
                        </SelectGroup>
                    ))}
                </TooltipProvider>
            </SelectContent>
        </Select>
    );
};

export default ModelSelector;
