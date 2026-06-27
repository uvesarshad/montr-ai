import { describe, it, expect } from 'vitest';
import {
  getAllBuiltInModels,
  getModelsByType,
  getModelsByTier,
  getModelsByProvider,
  findModelById,
  findModelByIdLoose,
  getCreditCost,
  getProviderInfo,
  groupModelsByProvider,
  type ModelDefinition,
} from './model-groups';

describe('getAllBuiltInModels', () => {
  it('returns a non-empty catalogue of well-formed model definitions', () => {
    const all = getAllBuiltInModels();
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.creditCost).toBe('number');
      expect(typeof m.provider).toBe('string');
    }
  });

  it('has unique model ids', () => {
    const ids = getAllBuiltInModels().map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getModelsByType / getModelsByTier', () => {
  it('filters by type and every result matches', () => {
    const text = getModelsByType('text');
    expect(text.length).toBeGreaterThan(0);
    expect(text.every((m) => m.type === 'text')).toBe(true);
  });

  it('returns an empty array for a type with no models', () => {
    // partition must be exhaustive across known types
    const total = ['text', 'image', 'video', 'avatar', 'audio'].reduce(
      (n, t) => n + getModelsByType(t as ModelDefinition['type']).length,
      0
    );
    expect(total).toBe(getAllBuiltInModels().length);
  });

  it('filters by tier and every result matches', () => {
    const free = getModelsByTier('free');
    expect(free.every((m) => m.tier === 'free')).toBe(true);
  });
});

describe('getModelsByProvider', () => {
  it('returns only models for the given provider', () => {
    const openai = getModelsByProvider('openai');
    expect(openai.length).toBeGreaterThan(0);
    expect(openai.every((m) => m.provider === 'openai')).toBe(true);
  });

  it('returns empty for an unknown provider', () => {
    expect(getModelsByProvider('definitely-not-a-provider')).toEqual([]);
  });
});

describe('findModelById / findModelByIdLoose', () => {
  it('finds a known model exactly', () => {
    expect(findModelById('gpt-5')?.id).toBe('gpt-5');
  });

  it('returns undefined for an unknown id', () => {
    expect(findModelById('nope-9000')).toBeUndefined();
  });

  it('loose-matches a provider-dated snapshot id by stripping the trailing -YYYYMMDD', () => {
    expect(findModelByIdLoose('claude-haiku-4-5-20251001')?.id).toBe('claude-haiku-4-5');
  });

  it('loose match falls back to exact when no date suffix is present', () => {
    expect(findModelByIdLoose('gpt-5')?.id).toBe('gpt-5');
  });

  it('loose match returns undefined when neither exact nor stripped id exists', () => {
    expect(findModelByIdLoose('ghost-model-20200101')).toBeUndefined();
  });
});

describe('getCreditCost', () => {
  it('returns the model credit cost for a known model', () => {
    const m = findModelById('gpt-5')!;
    expect(getCreditCost('gpt-5')).toBe(m.creditCost);
  });

  it('returns the scraping-service credit cost', () => {
    expect(getCreditCost('jinaai')).toBe(5);
  });

  it('defaults unknown ids (custom OpenRouter models) to 10', () => {
    expect(getCreditCost('some-custom-openrouter/model')).toBe(10);
  });
});

describe('getProviderInfo', () => {
  it('returns provider info for a known provider', () => {
    const info = getProviderInfo('openai');
    expect(info?.id).toBe('openai');
    expect(info?.name).toBeTruthy();
  });

  it('returns undefined for an unknown provider', () => {
    expect(getProviderInfo('nope')).toBeUndefined();
  });
});

describe('groupModelsByProvider', () => {
  it('buckets models under their provider id and preserves the total count', () => {
    const all = getAllBuiltInModels();
    const grouped = groupModelsByProvider(all);
    const flattened = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);
    expect(flattened).toBe(all.length);
    for (const [provider, models] of Object.entries(grouped)) {
      expect(models.every((m) => m.provider === provider)).toBe(true);
    }
  });

  it('returns an empty object for an empty input', () => {
    expect(groupModelsByProvider([])).toEqual({});
  });
});
