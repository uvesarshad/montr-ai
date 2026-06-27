'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Locale = 'en' | 'hi' | 'es' | 'fr' | 'pt' | 'ar';

export const SUPPORTED_LOCALES: { code: Locale; name: string; nativeName: string; dir: 'ltr' | 'rtl' }[] = [
    { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
    { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
];

const LOCALE_STORAGE_KEY = 'montr_locale';

type TranslationValue = string | Record<string, unknown>;
type Translations = Record<string, TranslationValue>;

interface I18nContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
    dir: 'ltr' | 'rtl';
    isLoaded: boolean;
}

const I18nContext = createContext<I18nContextType>({
    locale: 'en',
    setLocale: () => { },
    t: (key) => key,
    dir: 'ltr',
    isLoaded: false,
});

/**
 * Resolve a dot-notation key from a nested translations object.
 * e.g. "common.save" → translations.common.save
 */
function resolveKey(translations: Translations, key: string): string | undefined {
    const parts = key.split('.');
    let current: unknown = translations;
    for (const part of parts) {
        if (current === undefined || current === null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
}

/**
 * Interpolate {{param}} placeholders in a translation string.
 */
function interpolate(str: string, params?: Record<string, string | number>): string {
    if (!params) return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        params[key] !== undefined ? String(params[key]) : `{{${key}}}`
    );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>('en');
    const [translations, setTranslations] = useState<Translations>({});
    const [fallback, setFallback] = useState<Translations>({});
    const [isLoaded, setIsLoaded] = useState(false);

    // Load English as fallback on mount
    useEffect(() => {
        import('@/i18n/locales/en.json').then((mod) => {
            setFallback(mod.default as Translations);
        });
    }, []);

    // Detect saved locale or browser preference on mount
    useEffect(() => {
        const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
        if (saved && SUPPORTED_LOCALES.find((l) => l.code === saved)) {
            setLocaleState(saved);
        } else {
            // Auto-detect from browser
            const browserLang = navigator.language.split('-')[0] as Locale;
            const supported = SUPPORTED_LOCALES.find((l) => l.code === browserLang);
            if (supported) setLocaleState(supported.code);
        }
    }, []);

    // Load translations whenever locale changes
    useEffect(() => {
        setIsLoaded(false);
        const loadTranslations = async () => {
            try {
                let mod: { default: Translations };
                switch (locale) {
                    case 'hi': mod = await import('@/i18n/locales/hi.json'); break;
                    case 'es': mod = await import('@/i18n/locales/es.json'); break;
                    case 'fr': mod = await import('@/i18n/locales/fr.json'); break;
                    case 'pt': mod = await import('@/i18n/locales/pt.json'); break;
                    case 'ar': mod = await import('@/i18n/locales/ar.json'); break;
                    default: mod = await import('@/i18n/locales/en.json'); break;
                }
                setTranslations(mod.default as Translations);
            } catch {
                // Fallback to English on load error
                const mod = await import('@/i18n/locales/en.json');
                setTranslations(mod.default as Translations);
            } finally {
                setIsLoaded(true);
            }
        };
        loadTranslations();
    }, [locale]);

    // Apply dir and lang to <html> element
    useEffect(() => {
        const localeInfo = SUPPORTED_LOCALES.find((l) => l.code === locale);
        if (localeInfo) {
            document.documentElement.lang = locale;
            document.documentElement.dir = localeInfo.dir;
        }
    }, [locale]);

    const setLocale = useCallback((newLocale: Locale) => {
        localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
        setLocaleState(newLocale);
    }, []);

    const t = useCallback(
        (key: string, params?: Record<string, string | number>): string => {
            // Try current locale first, then fall back to English
            const value = resolveKey(translations, key) ?? resolveKey(fallback, key) ?? key;
            return interpolate(value, params);
        },
        [translations, fallback]
    );

    const dir = SUPPORTED_LOCALES.find((l) => l.code === locale)?.dir ?? 'ltr';

    return (
        <I18nContext.Provider value={{ locale, setLocale, t, dir, isLoaded }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    return useContext(I18nContext);
}

/** Convenience alias — matches common naming convention */
export const useTranslation = useI18n;
