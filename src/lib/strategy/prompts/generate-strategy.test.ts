
import { it, expect } from 'vitest';
import {
  buildStrategySystemPrompt,
  buildStrategyUserPrompt,
  buildDecomposeRoadmapPrompt,
} from './generate-strategy';

const SAMPLE_BRAND = {
  brandName: 'Acme Corp',
  brandVoice: 'Bold and innovative',
  targetAudience: 'B2B SaaS buyers',
  industry: 'Technology',
  competitors: ['Salesforce', 'HubSpot'],
  keyMessages: ['Grow faster', 'Ship smarter'],
  tone: 'Professional',
  personality: 'Expert',
};

// ─── buildStrategySystemPrompt ─────────────────────────────────────────────────

it('buildStrategySystemPrompt includes the brand name', () => {
  const prompt = buildStrategySystemPrompt(SAMPLE_BRAND);
  expect(prompt.includes('Acme Corp')).toBeTruthy();
});

it('buildStrategySystemPrompt includes brand voice and audience', () => {
  const prompt = buildStrategySystemPrompt(SAMPLE_BRAND);
  expect(prompt.includes('Bold and innovative')).toBeTruthy();
  expect(prompt.includes('B2B SaaS buyers')).toBeTruthy();
});

it('buildStrategySystemPrompt lists competitors', () => {
  const prompt = buildStrategySystemPrompt(SAMPLE_BRAND);
  expect(prompt.includes('Salesforce')).toBeTruthy();
  expect(prompt.includes('HubSpot')).toBeTruthy();
});

it('buildStrategySystemPrompt instructs to return valid JSON only', () => {
  const prompt = buildStrategySystemPrompt(SAMPLE_BRAND);
  expect(prompt.toLowerCase().includes('json')).toBeTruthy();
  expect(!prompt.includes('markdown fences') || prompt.includes('no markdown')).toBeTruthy();
});

it('buildStrategySystemPrompt falls back gracefully when optional fields are empty', () => {
  const prompt = buildStrategySystemPrompt({
    ...SAMPLE_BRAND,
    brandVoice: '',
    competitors: [],
    keyMessages: [],
  });
  expect(prompt.includes('Acme Corp')).toBeTruthy();
  expect(typeof prompt === 'string' && prompt.length > 0).toBeTruthy();
});

// ─── buildStrategyUserPrompt ───────────────────────────────────────────────────

it('buildStrategyUserPrompt includes the goal', () => {
  const prompt = buildStrategyUserPrompt({ goal: 'Grow MRR by 30% in Q3' });
  expect(prompt.includes('Grow MRR by 30% in Q3')).toBeTruthy();
});

it('buildStrategyUserPrompt includes constraints when provided', () => {
  const prompt = buildStrategyUserPrompt({
    goal: 'Increase signups',
    constraints: 'Budget: $5000, no paid ads',
  });
  expect(prompt.includes('Budget: $5000')).toBeTruthy();
});

it('buildStrategyUserPrompt omits constraints section when not provided', () => {
  const prompt = buildStrategyUserPrompt({ goal: 'Increase signups' });
  expect(!prompt.includes('Constraints:')).toBeTruthy();
});

it('buildStrategyUserPrompt includes historical notes when provided', () => {
  const prompt = buildStrategyUserPrompt({
    goal: 'Increase signups',
    historicalNotes: 'Email outperformed social by 3x last quarter',
  });
  expect(prompt.includes('Email outperformed social')).toBeTruthy();
});

it('buildStrategyUserPrompt includes the required JSON schema fields', () => {
  const prompt = buildStrategyUserPrompt({ goal: 'Test' });
  // Verify the schema fields that the LLM must populate are in the prompt
  for (const field of ['name', 'description', 'goals', 'channels', 'contentMix', 'cadence']) {
    expect(prompt.includes(field)).toBeTruthy();
  }
});

// ─── buildDecomposeRoadmapPrompt ───────────────────────────────────────────────

const SAMPLE_CADENCE = { postsPerWeek: 5, emailsPerWeek: 2, callsPerWeek: 0, whatsappPerWeek: 3 };

it('buildDecomposeRoadmapPrompt includes the strategy name', () => {
  const prompt = buildDecomposeRoadmapPrompt({
    strategyName: 'Q3 Growth Push',
    strategyDescription: 'Drive signups via email and LinkedIn',
    goals: [{ kpi: 'MRR', target: '+30%', deadline: '2026-09-30' }],
    channels: ['email', 'linkedin'],
    cadence: SAMPLE_CADENCE,
  });
  expect(prompt.includes('Q3 Growth Push')).toBeTruthy();
});

it('buildDecomposeRoadmapPrompt includes channels', () => {
  const prompt = buildDecomposeRoadmapPrompt({
    strategyName: 'Test Strategy',
    strategyDescription: 'Test',
    goals: [],
    channels: ['whatsapp', 'voice'],
    cadence: SAMPLE_CADENCE,
  });
  expect(prompt.includes('whatsapp')).toBeTruthy();
  expect(prompt.includes('voice')).toBeTruthy();
});

it('buildDecomposeRoadmapPrompt requires JSON output', () => {
  const prompt = buildDecomposeRoadmapPrompt({
    strategyName: 'Test',
    strategyDescription: 'Test',
    goals: [],
    channels: [],
    cadence: SAMPLE_CADENCE,
  });
  expect(prompt.toLowerCase().includes('json')).toBeTruthy();
});
