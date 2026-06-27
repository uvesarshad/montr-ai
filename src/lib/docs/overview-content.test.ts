import { it, expect } from 'vitest';

import {
  buildArchitectureStarterHtml,
  docsOverviewCollections,
  getDocsOverviewMetrics,
} from './overview-content';

it('getDocsOverviewMetrics derives stable counts from the overview collections', () => {
  const metrics = getDocsOverviewMetrics(docsOverviewCollections);

  expect(metrics.map((metric) => ({ id: metric.id, value: metric.value }))).toEqual([
      { id: 'modules', value: '9' },
      { id: 'systems', value: '11' },
      { id: 'flows', value: '5' },
      { id: 'reference', value: '4' },
    ]);
});

it('buildArchitectureStarterHtml includes current platform structure and storage options', () => {
  const html = buildArchitectureStarterHtml();

  expect(html).toMatch(/Montr AI Platform Overview/i);
  expect(html).toMatch(/Social Media/);
  expect(html).toMatch(/Google Drive/);
  expect(html).toMatch(/Cross-Module Flows/);
  expect(html).toMatch(/Recent Platform Changes/);
});
