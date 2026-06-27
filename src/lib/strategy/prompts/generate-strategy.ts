/**
 * System prompt for the strategy generation LLM call.
 * Brand context is injected at invocation time and gets prompt-cached
 * by the Anthropic provider (cache_control: ephemeral on the system block).
 */

export function buildStrategySystemPrompt(brandContext: {
  brandName: string;
  brandVoice: string;
  targetAudience: string;
  industry: string;
  competitors: string[];
  keyMessages: string[];
  tone: string;
  personality: string;
}): string {
  return `You are a senior marketing strategist for ${brandContext.brandName}.

BRAND PROFILE (cached context — do not repeat in output):
- Brand voice: ${brandContext.brandVoice || 'Professional and authoritative'}
- Target audience: ${brandContext.targetAudience || 'General business audience'}
- Industry: ${brandContext.industry || 'Technology'}
- Tone: ${brandContext.tone || 'Professional'}
- Personality: ${brandContext.personality || 'Expert and approachable'}
- Competitors: ${brandContext.competitors.join(', ') || 'None specified'}
- Key messages: ${brandContext.keyMessages.join('; ') || 'None specified'}

Your task is to generate structured marketing strategies as JSON objects.
Always return valid JSON — no markdown fences, no prose outside the JSON.
Your output must conform exactly to the strategy schema provided in each user message.`;
}

export function buildStrategyUserPrompt(params: {
  goal: string;
  constraints?: string;
  historicalNotes?: string;
  /** Channels the brand has ACTUALLY connected — a hard allowlist. */
  connectedChannels?: string[];
  /** Realistic benchmark ranges to keep targets/cadence grounded. */
  benchmarkText?: string;
  /** Unresolved issues from a prior version, to avoid repeating them. */
  priorValidationNote?: string;
}): string {
  const channelConstraint =
    params.connectedChannels && params.connectedChannels.length > 0
      ? `\n\nHARD CONSTRAINT — ONLY recommend channels the brand has connected: ${params.connectedChannels.join(', ')}. Do NOT suggest any channel outside this list, and do not set a cadence (e.g. whatsappPerWeek) for a channel that is not connected.`
      : `\n\nNOTE: no connected channels were detected for this brand — keep channel recommendations conservative and clearly tied to the goal.`;

  return `Generate a marketing strategy for this goal: "${params.goal}"
${params.constraints ? `\nConstraints: ${params.constraints}` : ''}
${params.historicalNotes ? `\nHistorical performance notes (use to tune the strategy): ${params.historicalNotes}` : ''}
${params.benchmarkText ? `\n${params.benchmarkText} Keep every target and cadence number inside these ranges.` : ''}
${params.priorValidationNote ? `\n${params.priorValidationNote}` : ''}${channelConstraint}

Return a JSON object with this exact structure:
{
  "name": "Strategy name (short, memorable)",
  "description": "2-3 sentence overview of the strategy",
  "goals": [
    { "kpi": "KPI name", "target": "Numeric or qualitative target", "deadline": "ISO date" }
  ],
  "channels": ["list of marketing channels, e.g. whatsapp, email, linkedin, voice"],
  "contentMix": { "video": 30, "image": 40, "text": 30 },
  "cadence": {
    "postsPerWeek": 5,
    "emailsPerWeek": 2,
    "callsPerWeek": 0,
    "whatsappPerWeek": 3
  },
  "rationale": "Why this channel mix and cadence for the goal"
}`;
}

export function buildDecomposeRoadmapPrompt(params: {
  strategyName: string;
  strategyDescription: string;
  goals: Array<{ kpi: string; target: string; deadline: string }>;
  channels: string[];
  cadence: Record<string, number>;
}): string {
  return `Decompose this marketing strategy into an ordered mission roadmap.

Strategy: "${params.strategyName}"
Description: ${params.strategyDescription}
Goals: ${JSON.stringify(params.goals)}
Channels: ${params.channels.join(', ')}
Cadence: ${JSON.stringify(params.cadence)}

Available mission template IDs:
- recruitment-sourcing, recruitment-outreach, recruitment-screening, recruitment-scheduling, recruitment-followup
- content-creation, social-publishing, email-campaign, whatsapp-blast, lead-nurture
- audience-research, competitor-analysis, performance-review, win-back-campaign

Return a JSON array of roadmap entries:
[
  {
    "id": "step-1",
    "missionTemplateId": "one of the template IDs above",
    "title": "Step title",
    "description": "What this step achieves",
    "dependsOn": [],
    "channel": "primary channel for this step",
    "suggestedStartOffset": "P0D",
    "estimatedDurationDays": 7
  }
]

Order entries logically. Use dependsOn to encode prerequisites (use entry id strings).`;
}
