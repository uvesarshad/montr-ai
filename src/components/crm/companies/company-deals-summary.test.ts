import { it, expect } from 'vitest';

import { Deal } from '@/types/crm';
import { buildCompanyDealsSummary } from './company-deals-summary';

function buildDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    _id: 'deal-1',
    organizationId: 'org-1',
    pipelineId: 'pipeline-1',
    stageId: 'stage-1',
    name: 'Expansion',
    value: 10000,
    currency: 'USD',
    probability: 50,
    status: 'open',
    tags: [],
    customFields: {},
    priority: 'medium',
    totalActivities: 0,
    stageHistory: [],
    createdById: 'user-1',
    createdAt: new Date('2026-03-10T08:00:00.000Z'),
    updatedAt: new Date('2026-03-20T08:00:00.000Z'),
    ...overrides,
  };
}

it('buildCompanyDealsSummary counts statuses and sorts deals by freshest activity', () => {
  const summary = buildCompanyDealsSummary([
    buildDeal({
      _id: 'deal-open',
      name: 'Expansion',
      status: 'open',
      value: 25000,
      updatedAt: new Date('2026-03-20T08:00:00.000Z'),
    }),
    buildDeal({
      _id: 'deal-won',
      name: 'Renewal',
      status: 'won',
      value: 12000,
      updatedAt: new Date('2026-03-18T08:00:00.000Z'),
    }),
    buildDeal({
      _id: 'deal-lost',
      name: 'Pilot',
      status: 'lost',
      value: 9000,
      updatedAt: new Date('2026-03-19T08:00:00.000Z'),
    }),
    buildDeal({
      _id: 'deal-abandoned',
      name: 'Dormant',
      status: 'abandoned',
      value: 4000,
      updatedAt: new Date('2026-03-11T08:00:00.000Z'),
    }),
  ]);

  expect(summary.totalDeals).toBe(4);
  expect(summary.openDeals).toBe(1);
  expect(summary.wonDeals).toBe(1);
  expect(summary.lostDeals).toBe(1);
  expect(summary.abandonedDeals).toBe(1);
  expect(summary.openValue).toBe(25000);
  expect(summary.wonValue).toBe(12000);
  expect(summary.sortedDeals.map((deal) => deal._id)).toEqual([
    'deal-open',
    'deal-lost',
    'deal-won',
    'deal-abandoned',
  ]);
});
