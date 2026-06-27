'use client';

import { Globe } from 'lucide-react';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/i18n/i18n-context';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface LanguageSwitcherProps {
    /** Show the current language name next to the globe icon */
    showLabel?: boolean;
    /** Additional class names */
    className?: string;
    /** Button variant (ignored when using Select, kept for compatibility if needed) */
    variant?: 'ghost' | 'outline' | 'default';
}

export function LanguageSwitcher({
    showLabel = false,
    className,
}: LanguageSwitcherProps) {
    const { locale, setLocale } = useI18n();

    const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === locale);

    return (
        <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
            <SelectTrigger className={cn("w-[200px]", className)}>
                <div className="flex items-center gap-2">
                    <Globe className="size-4 text-muted-foreground" />
                    <SelectValue placeholder="Select Language">
                        {showLabel ? currentLocale?.nativeName ?? 'English' : currentLocale?.code?.toUpperCase() ?? 'EN'}
                    </SelectValue>
                </div>
            </SelectTrigger>
            <SelectContent>
                {SUPPORTED_LOCALES.map((loc) => (
                    <SelectItem key={loc.code} value={loc.code}>
                        <div className="flex items-center justify-between w-full">
                            <span>{loc.nativeName}</span>
                            <span className="text-xs text-muted-foreground ml-2">{loc.name}</span>
                        </div>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
