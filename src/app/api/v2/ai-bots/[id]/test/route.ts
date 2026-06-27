/**
 * AI Bot synthetic test turn — POST a message, get a reply.
 *
 * Uses a no-op sender and a transient conversation id so nothing is sent on
 * channel and no real conversation state is polluted. The bot's
 * `ai_bot_conversation_state` row IS created (keyed on the transient id) —
 * it's harmless because the conversation id won't match any real channel
 * lookup. Callers can clean up via DELETE on the state if desired.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { getSession } from '@/lib/get-session';
import { aiBotRepository } from '@/lib/db/repository/ai-bot.repository';
import { testAiBotSchema } from '@/validations/ai-bot.schema';
import { runAiBotTurn } from '@/lib/ai-bots/runtime';

interface SessionUser {
  id?: string;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!Types.ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const bot = await aiBotRepository.findById(params.id);
  if (!bot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = testAiBotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  if (!bot.enabledChannels.includes(parsed.data.channel)) {
    return NextResponse.json(
      { error: `Bot is not enabled for channel '${parsed.data.channel}'.` },
      { status: 400 },
    );
  }

  const syntheticConversationId = new Types.ObjectId().toString();
  const collectedReply: { text: string | null } = { text: null };

  const start = Date.now();
  try {
    const result = await runAiBotTurn({
      botId: params.id,
      channel: parsed.data.channel,
      conversationId: syntheticConversationId,
      brandId: bot.brandId ? String(bot.brandId) : null,
      contactId: null,
      inboundMessage: parsed.data.message,
      sender: {
        async send(text: string): Promise<void> {
          collectedReply.text = text;
        },
      },
    });
    const latencyMs = Date.now() - start;
    return NextResponse.json({
      reply: result.reply ?? collectedReply.text,
      escalationRequested: result.escalationRequested,
      toolCalls: result.toolCalls,
      latencyMs,
      syntheticConversationId,
    });
  } catch (err) {
    console.error('[ai-bots.test]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
