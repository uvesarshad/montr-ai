/**
 * Tests for the legacy workflow read-only gate. No DB / Next runtime needed —
 * the helper inspects an env var and returns a NextResponse.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isLegacyReadOnly, denyIfReadOnly } from './legacy-workflow-readonly';

const FLAG = 'WORKFLOW_CONSOLIDATION_READONLY';

describe('legacy-workflow-readonly', () => {
  const originalValue = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalValue;
    }
  });

  it('returns false when the env var is unset', () => {
    expect(isLegacyReadOnly()).toBe(false);
  });

  it('returns true for common truthy spellings', () => {
    for (const truthy of ['1', 'true', 'TRUE', 'yes', 'on']) {
      process.env[FLAG] = truthy;
      expect(isLegacyReadOnly()).toBe(true);
    }
  });

  it('returns false for falsy / other values', () => {
    for (const falsy of ['0', 'false', 'no', 'off', '', 'maybe']) {
      process.env[FLAG] = falsy;
      expect(isLegacyReadOnly()).toBe(false);
    }
  });

  it('denyIfReadOnly returns null when not sealed', () => {
    expect(denyIfReadOnly({ system: 'crm_workflows' })).toBeNull();
  });

  it('denyIfReadOnly returns a 409 response payload pointing at the unified surface', async () => {
    process.env[FLAG] = 'true';
    const res = denyIfReadOnly({ system: 'whatsapp_workflows', unifiedPath: '/canvases/foo' });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);
    const body = await res!.json();
    expect(body.error).toMatch(/read-only/i);
    expect(body.unifiedSurface).toBe('/canvases/foo');
    expect(body.flag).toBe(FLAG);
  });
});
