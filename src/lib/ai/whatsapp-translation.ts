import OpenAI from 'openai';

/**
 * AI Translation Service for WhatsApp messages
 * Uses OpenAI API for translation
 */

interface TranslationConfig {
  apiKey: string;
  model?: string; // Default: gpt-3.5-turbo
  maxTokens?: number;
}

interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage: string;
  preserveFormatting?: boolean;
}

const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  fr: 'French',
  ja: 'Japanese',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  ko: 'Korean',
};

/**
 * Translate message using OpenAI
 */
export async function translateMessage(
  message: string,
  config: TranslationConfig,
  options: TranslationOptions
): Promise<{ translatedText: string; detectedLanguage?: string }> {
  try {
    const openai = new OpenAI({
      apiKey: config.apiKey,
    });

    const model = config.model || 'gpt-3.5-turbo';
    const maxTokens = config.maxTokens || 1000;

    // Build prompt
    const targetLangName = SUPPORTED_LANGUAGES[options.targetLanguage as keyof typeof SUPPORTED_LANGUAGES] || options.targetLanguage;

    let prompt = `Translate the following message to ${targetLangName}`;

    if (options.sourceLanguage) {
      const sourceLangName = SUPPORTED_LANGUAGES[options.sourceLanguage as keyof typeof SUPPORTED_LANGUAGES] || options.sourceLanguage;
      prompt = `Translate the following message from ${sourceLangName} to ${targetLangName}`;
    }

    if (options.preserveFormatting) {
      prompt += '. Preserve any formatting, line breaks, and special characters';
    }

    prompt += `:\n\n${message}`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate the given text accurately while preserving the original meaning and tone. Only return the translated text without any explanations or additional comments.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.3, // Lower temperature for more consistent translations
    });

    const translatedText = completion.choices[0]?.message?.content?.trim() || message;

    return {
      translatedText,
      detectedLanguage: options.sourceLanguage,
    };
  } catch (error: unknown) {
    console.error('Translation error:', error);
    throw new Error(`Failed to translate message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Detect language of a message using OpenAI
 */
export async function detectLanguage(
  message: string,
  config: TranslationConfig
): Promise<string> {
  try {
    const openai = new OpenAI({
      apiKey: config.apiKey,
    });

    const model = config.model || 'gpt-3.5-turbo';

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a language detection system. Return only the ISO 639-1 language code (e.g., "en" for English, "es" for Spanish) without any explanation.',
        },
        {
          role: 'user',
          content: `Detect the language of this message:\n\n${message}`,
        },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const languageCode = completion.choices[0]?.message?.content?.trim().toLowerCase() || 'en';

    // Validate language code
    if (languageCode.length === 2 && /^[a-z]{2}$/.test(languageCode)) {
      return languageCode;
    }

    return 'en'; // Default to English if detection fails
  } catch (error) {
    console.error('Language detection error:', error);
    return 'en'; // Default to English on error
  }
}

/**
 * Batch translate multiple messages
 */
export async function batchTranslate(
  messages: string[],
  config: TranslationConfig,
  options: TranslationOptions
): Promise<string[]> {
  const promises = messages.map((message) =>
    translateMessage(message, config, options).then((result) => result.translatedText)
  );

  return Promise.all(promises);
}

/**
 * Auto-translate incoming/outgoing messages with settings
 */
export async function autoTranslate(
  message: string,
  direction: 'incoming' | 'outgoing',
  userLanguage: string,
  contactLanguage: string,
  config: TranslationConfig,
  settings: {
    translateIncoming: boolean;
    translateOutgoing: boolean;
    enabled: boolean;
  }
): Promise<{ translated: boolean; translatedText?: string; originalText: string }> {
  if (!settings.enabled) {
    return { translated: false, originalText: message };
  }

  try {
    if (direction === 'incoming' && settings.translateIncoming) {
      // Translate incoming message from contact language to user language
      const result = await translateMessage(message, config, {
        sourceLanguage: contactLanguage,
        targetLanguage: userLanguage,
        preserveFormatting: true,
      });

      return {
        translated: true,
        translatedText: result.translatedText,
        originalText: message,
      };
    }

    if (direction === 'outgoing' && settings.translateOutgoing) {
      // Translate outgoing message from user language to contact language
      const result = await translateMessage(message, config, {
        sourceLanguage: userLanguage,
        targetLanguage: contactLanguage,
        preserveFormatting: true,
      });

      return {
        translated: true,
        translatedText: result.translatedText,
        originalText: message,
      };
    }

    return { translated: false, originalText: message };
  } catch (error) {
    console.error('Auto-translate error:', error);
    return { translated: false, originalText: message };
  }
}

export const supportedLanguages = SUPPORTED_LANGUAGES;
