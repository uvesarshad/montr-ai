'use client';

import React from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui-kit';
import { Plus, X, Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES, MultilingualContent } from '@/lib/whatsapp/automation/i18n';

interface MultilingualInputProps {
    value: MultilingualContent | string; // Backward compatibility with string
    onChange: (value: MultilingualContent) => void;
    placeholder?: string;
    label?: string;
    rows?: number;
}

export function MultilingualInput({
    value,
    onChange,
    placeholder,
    label,
    rows = 3
}: MultilingualInputProps) {
    // Normalize value to MultilingualContent structure
    const content: MultilingualContent = typeof value === 'string'
        ? { default: value, translations: {} }
        : value || { default: '', translations: {} };

    const [activeTab, setActiveTab] = React.useState('default');
    const [_availableLanguages, _setAvailableLanguages] = React.useState(SUPPORTED_LANGUAGES.filter(l => !l.isDefault && !content.translations[l.code]));

    const updateDefault = (text: string) => {
        onChange({
            ...content,
            default: text
        });
    };

    const updateTranslation = (langCode: string, text: string) => {
        onChange({
            ...content,
            translations: {
                ...content.translations,
                [langCode]: text
            }
        });
    };

    const addLanguage = (langCode: string) => {
        onChange({
            ...content,
            translations: {
                ...content.translations,
                [langCode]: ''
            }
        });
        setActiveTab(langCode);
    };

    const removeLanguage = (langCode: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newTranslations = { ...content.translations };
        delete newTranslations[langCode];
        onChange({
            ...content,
            translations: newTranslations
        });
        if (activeTab === langCode) {
            setActiveTab('default');
        }
    };

    const addedLanguages = Object.keys(content.translations);

    return (
        <div className="space-y-2">
            {label && <label className="flex items-center gap-2 text-sm font-medium text-foreground"><Globe className="size-3" /> {label}</label>}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex justify-between items-center mb-2">
                    <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
                        <TabsTrigger
                            value="default"
                            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border px-3 py-1"
                        >
                            Default (PB)
                        </TabsTrigger>
                        {addedLanguages.map(lang => (
                            <TabsTrigger
                                key={lang}
                                value={lang}
                                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground border px-3 py-1 gap-2"
                            >
                                {SUPPORTED_LANGUAGES.find(l => l.code === lang)?.name || lang}
                                <X
                                    className="size-3 hover:text-destructive"
                                    onClick={(e) => removeLanguage(lang, e)}
                                />
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    <Select onValueChange={addLanguage}>
                        <SelectTrigger className="w-[130px] h-8">
                            <Plus className="mr-2 size-3" />
                            <span className="text-xs">Add Locale</span>
                        </SelectTrigger>
                        <SelectContent>
                            {SUPPORTED_LANGUAGES.filter(l => !l.isDefault && !content.translations[l.code]).map(lang => (
                                <SelectItem key={lang.code} value={lang.code}>
                                    {lang.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <TabsContent value="default" className="mt-0">
                    <Textarea
                        value={content.default}
                        onChange={(e) => updateDefault(e.target.value)}
                        placeholder={placeholder || "Enter text..."}
                        rows={rows}
                        className="resize-none"
                    />
                </TabsContent>

                {addedLanguages.map(lang => (
                    <TabsContent key={lang} value={lang} className="mt-0">
                        <Textarea
                            value={content.translations[lang] || ''}
                            onChange={(e) => updateTranslation(lang, e.target.value)}
                            placeholder={`Enter ${SUPPORTED_LANGUAGES.find(l => l.code === lang)?.name} translation...`}
                            rows={rows}
                            className="resize-none"
                        />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
