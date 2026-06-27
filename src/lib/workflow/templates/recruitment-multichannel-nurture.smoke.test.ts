/**
 * Joint flagship smoke (B3-6.3 / #15) — integration-level invariants.
 *
 * Full live E2E (5 candidates → call → WhatsApp → email → reply branch) needs
 * a real environment with Twilio, Meta, and an ESP configured — out of scope
 * for the vitest suite. This file covers the layer above the unit-level graph
 * checks: every node subType referenced by the template MUST have a real
 * processor registered. If any path resolves to a NotImplementedProcessor
 * stub, the recruitment flow would fail mid-execution against real providers.
 *
 * We do this without instantiating the registry (which would pull in
 * `@/auth` and other Next.js runtime imports that vitest can't resolve).
 * Instead we parse the registry source for the static `RESERVED_FOR_B3`
 * stub list and assert no template subType lives in it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRecruitmentTemplateGraph } from './recruitment-multichannel-nurture';

const REGISTRY_PATH = resolve(__dirname, '../node-processors/index.ts');
const REGISTRY_SOURCE = readFileSync(REGISTRY_PATH, 'utf8');

/**
 * Extract subType identifiers from the registry's `RESERVED_FOR_B3` array.
 * Matches `{ subType: 'foo', label: 'Foo' }` shapes.
 */
function extractStubbedSubTypes(source: string): string[] {
  const reservedBlock = source.match(/RESERVED_FOR_B3:\s*Array<[^>]+>\s*=\s*\[([\s\S]*?)\];/);
  if (!reservedBlock) return [];
  const matches = [...reservedBlock[1].matchAll(/subType:\s*'([^']+)'/g)];
  return matches.map(m => m[1]);
}

describe('recruitment template — joint smoke (#15)', () => {
  const { nodes } = buildRecruitmentTemplateGraph();
  const stubbed = extractStubbedSubTypes(REGISTRY_SOURCE);

  it('the registry exposes at least one reserved stub', () => {
    // Sanity check that our parser works — if this fails the regex is wrong
    // and the test below would silently pass even with real stubs.
    expect(stubbed.length).toBeGreaterThan(0);
  });

  it('no node in the recruitment graph resolves to a NotImplementedProcessor stub', () => {
    const offenders = nodes
      .map(n => ({ id: n.id, subType: n.subType }))
      .filter(n => stubbed.includes(n.subType));
    expect(
      offenders,
      `These subTypes are reserved but not yet implemented — ` +
      `recruitment flow will fail mid-run: ${offenders.map(s => s.subType).join(', ')}`
    ).toEqual([]);
  });
});
