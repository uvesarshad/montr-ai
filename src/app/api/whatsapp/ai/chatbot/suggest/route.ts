import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { generateChatbotResponse } from '@/lib/ai/whatsapp-chatbot';

/**
 * Generate AI chatbot suggestion for a message
 * POST /api/whatsapp/ai/chatbot/suggest
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const {
      message,
      contactId,
      accountId,
      businessName,
      businessDescription,
      systemPrompt,
    } = await request.json();

    if (!message || !message.trim()) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!contactId || !accountId) {
      return NextResponse.json(
        { error: 'Contact ID and Account ID are required' },
        { status: 400 }
      );
    }

    // Get OpenAI API key
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
      maxTokens: 500,
      temperature: 0.7,
      contextMessages: 5,
      systemPrompt,
    };

    const context = {
      contactId,
      accountId,
      businessName,
      businessDescription,
    };

    // Generate chatbot response
    const result = await generateChatbotResponse(message, context, config);

    return NextResponse.json({
      data: {
        suggestion: result.response,
        confidence: result.confidence,
        confidenceLevel:
          result.confidence >= 0.8
            ? 'high'
            : result.confidence >= 0.6
            ? 'medium'
            : 'low',
      },
    });
  } catch (error) {
    console.error('Error generating chatbot suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to generate suggestion', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
