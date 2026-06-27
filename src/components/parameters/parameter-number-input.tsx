'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info, Dice5 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParameterNumberInputProps {
    label: string;
    value: number | null;
    onChange: (value: number | null) => void;
    min?: number;
    max?: number;
    placeholder?: string;
    tooltip?: string;
    showRandomize?: boolean;
    disabled?: boolean;
    className?: string;
}

export const ParameterNumberInput = ({
    label,
    value,
    onChange,
    min,
    max,
    placeholder = 'Enter value...',
    tooltip,
    showRandomize = false,
    disabled = false,
    className,
}: ParameterNumberInputProps) => {
    const handleRandomize = () => {
        const randomValue = Math.floor(Math.random() * 4294967295);
        onChange(randomValue);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const inputValue = e.target.value;
        if (inputValue === '') {
            onChange(null);
            return;
        }

        let numValue = parseInt(inputValue, 10);
        if (isNaN(numValue)) return;

        if (min !== undefined && numValue < min) numValue = min;
        if (max !== undefined && numValue > max) numValue = max;

        onChange(numValue);
    };

    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium">{label}</Label>
                {tooltip && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="size-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                                <p className="text-xs">{tooltip}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
            <div className="flex gap-2">
                <Input
                    type="number"
                    value={value ?? ''}
                    onChange={handleChange}
                    placeholder={placeholder}
                    disabled={disabled}
                    min={min}
                    max={max}
                    className="flex-1 h-8 text-xs font-mono"
                />
                {showRandomize && (
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={handleRandomize}
                                    disabled={disabled}
                                    className="size-8 shrink-0"
                                >
                                    <Dice5 className="size-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="text-xs">Generate random seed</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
        </div>
    );
};
