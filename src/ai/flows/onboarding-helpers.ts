export interface ParsedRoadmapTask {
  title: string;
  description: string;
  type: 'content' | 'strategy' | 'research' | 'outreach' | 'campaign' | 'automation' | 'other';
  difficulty: 'easy' | 'medium' | 'hard';
  xpReward: number;
}

export interface ParsedRoadmapPlan {
  businessName: string;
  businessType: string;
  targetAudience: string;
  goals: string[];
  tasks: ParsedRoadmapTask[];
}

export function normalizeWebsiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withProtocol);
  return url.toString();
}

export function parseGeneratedRoadmap(input: string): ParsedRoadmapPlan | null {
  const candidate = extractJsonCandidate(input);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as ParsedRoadmapPlan;
    if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function splitDelimitedInput(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractJsonCandidate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return trimmed.slice(firstBrace, lastBrace + 1).trim();
}
