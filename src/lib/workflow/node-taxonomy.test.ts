/**
 * Tests for the workflow node taxonomy registry.
 *
 * Pure unit tests — no DB. The registry's value is its invariants:
 *   - no duplicate subType keys
 *   - every taxonomyCategory has at least one entry
 *   - reserved-for-B3 entries are tagged but real
 *   - missing-processor entries are flagged
 */

import { describe, it, expect } from 'vitest';
import {
  NODE_TAXONOMY,
  getTaxonomyEntry,
  getEntriesByCategory,
  getEntriesByChannel,
  getReservedEntries,
  getMissingProcessorEntries,
  getCategoryCoverage,
} from './node-taxonomy';

describe('node-taxonomy', () => {
  it('has unique subType keys across the registry', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const e of NODE_TAXONOMY) {
      if (seen.has(e.subType)) dupes.push(e.subType);
      seen.add(e.subType);
    }
    expect(dupes).toEqual([]);
  });

  it('covers every taxonomy category with at least one entry', () => {
    const coverage = getCategoryCoverage();
    for (const [cat, count] of Object.entries(coverage)) {
      expect(count, `category ${cat} has entries`).toBeGreaterThan(0);
    }
  });

  it('looks up entries by subType', () => {
    const entry = getTaxonomyEntry('send_whatsapp_text');
    expect(entry).toBeDefined();
    expect(entry?.taxonomyCategory).toBe('channel');
    expect(entry?.channel).toBe('whatsapp');
    expect(entry?.executionCategory).toBe('action');
  });

  it('groups entries by taxonomy category', () => {
    const triggers = getEntriesByCategory('trigger');
    expect(triggers.length).toBeGreaterThan(5);
    expect(triggers.every(e => e.taxonomyCategory === 'trigger')).toBe(true);
  });

  it('groups entries by channel kind', () => {
    const whatsapp = getEntriesByChannel('whatsapp');
    expect(whatsapp.length).toBeGreaterThanOrEqual(5);
    expect(whatsapp.every(e => e.channel === 'whatsapp')).toBe(true);
  });

  it('lists reserved-for-B3 entries', () => {
    const reserved = getReservedEntries();
    const subTypes = reserved.map(e => e.subType);
    expect(subTypes).toContain('make_outbound_call');
    expect(subTypes).toContain('wait_for_call_response');
    expect(subTypes).toContain('call_completed');
    expect(subTypes).toContain('call_inbound');
    expect(subTypes).toContain('identity_resolve');
  });

  it('omits reserved entries from the missing-processor list', () => {
    const missing = getMissingProcessorEntries();
    // None of the missing entries should be reservedFor anyone — those are
    // intentionally deferred, not gaps for B2-1.5.
    expect(missing.every(e => !e.reservedFor)).toBe(true);
  });

  it('returns undefined for unknown subType', () => {
    expect(getTaxonomyEntry('totally-fake-key')).toBeUndefined();
  });
});
