'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParameterSliderProps {
    label: string;
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    tooltip?: string;
    unit?: string;
    showValue?: boolean;
    disabled?: boolean;
    className?: string;
}

export const ParameterSlider = ({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    tooltip,
    unit = '',
    showValue = true,
    disabled = false,
    className,
}: ParameterSliderProps) => {
    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex items-center justify-between">
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
                {showValue && (
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                        {value}{unit}
                    </span>
                )}
            </div>
            <Slider
                value={[value]}
                onValueChange={(values) => onChange(values[0])}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                className="w-full"
            />
        </div>
    );
};
