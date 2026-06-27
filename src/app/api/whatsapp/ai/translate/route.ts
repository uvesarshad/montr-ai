import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { translateMessage, detectLanguage } from '@/lib/ai/whatsapp-translation';

/**
 * Translate WhatsApp message using AI
 * POST /api/whatsapp/ai/translate
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const { message, targetLanguage, sourceLanguage, detectSource } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!targetLanguage) {
      return NextResponse.json(
        { error: 'Target language is required' },
        { status: 400 }
      );
    }

    // Get OpenAI API key from environment variable
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const config = {
      apiKey,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      maxTokens: 1000,
    };

    let detectedLang = sourceLanguage;

    // Detect source language if requested
    if (detectSource && !sourceLanguage) {
      detectedLang = await detectLanguage(message, config);
    }

    // Translate message
    const result = await translateMessage(message, config, {
      sourceLanguage: detectedLang,
      targetLanguage,
      preserveFormatting: true,
    });

    return NextResponse.json({
      data: {
        originalText: message,
        translatedText: result.translatedText,
        sourceLanguage: detectedLang,
        targetLanguage,
      },
    });
  } catch (error) {
    console.error('Error translating message:', error);
    return NextResponse.json(
      { error: 'Failed to translate message', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
