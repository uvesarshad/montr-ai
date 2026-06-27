import { it, expect } from 'vitest';

import {
  normalizeWebsiteUrl,
  parseGeneratedRoadmap,
} from './onboarding-helpers';

it('normalizeWebsiteUrl normalizes bare and full URLs', () => {
  expect(normalizeWebsiteUrl('example.com')).toBe('https://example.com/');

  expect(normalizeWebsiteUrl('https://www.example.com/products')).toBe('https://www.example.com/products');
});

it('parseGeneratedRoadmap parses a fenced JSON roadmap and rejects invalid input', () => {
  const parsedRoadmap = parseGeneratedRoadmap(`
\`\`\`json
{
  "businessName": "Acme",
  "businessType": "saas",
  "targetAudience": "Founders",
  "goals": ["lead-gen"],
  "tasks": [
    {
      "title": "Publish a founder story",
      "description": "Share a customer pain-point post on LinkedIn.",
      "type": "content",
      "difficulty": "easy",
      "xpReward": 10
    }
  ]
}
\`\`\`
`);

  expect(parsedRoadmap?.businessName).toBe('Acme');
  expect(parsedRoadmap?.tasks.length).toBe(1);

  expect(parseGeneratedRoadmap('not valid json at all')).toBe(null);
});
