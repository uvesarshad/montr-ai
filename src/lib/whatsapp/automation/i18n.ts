
export interface Translation {
    [key: string]: string;
}

export interface Language {
    code: string;
    name: string;
    isDefault?: boolean;
}

export const SUPPORTED_LANGUAGES: Language[] = [
    { code: 'en', name: 'English', isDefault: true },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'it', name: 'Italian' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ar', name: 'Arabic' },
];

export interface MultilingualContent {
    default: string;
    translations: { [langCode: string]: string };
}
