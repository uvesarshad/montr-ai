import { it, expect } from 'vitest';

import type { Company, Contact, Deal, Pipeline } from '@/types/crm';
import {
  buildContactInsight,
  buildContactListInsights,
  buildCompanyListInsights,
  buildDashboardInsights,
  buildDealInsight,
} from './ai-insights';

function buildContact(overrides: Partial<Contact> = {}): Contact {
  return {
    _id: 'contact-1',
    organizationId: 'org-1',
    firstName: 'Ava',
    lastName: 'Stone',
    channels: [],
    source: 'website',
    status: 'lead',
    lifecycle: 'lead',
    rating: 'hot',
    score: 82,
    tags: [],
    customFields: {},
    totalActivities: 4,
    totalEmails: 3,
    marketingConsent: true,
    doNotContact: false,
    createdById: 'user-1',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    _id: 'deal-1',
    organizationId: 'org-1',
    pipelineId: 'pipeline-1',
    stageId: 'stage-2',
    name: 'Expansion Renewal',
    value: 45000,
    currency: 'USD',
    probability: 55,
    status: 'open',
    tags: [],
    customFields: {},
    priority: 'high',
    totalActivities: 8,
    stageHistory: [
      {
        stageId: 'stage-1',
        stageName: 'Qualified',
        enteredAt: new Date('2026-02-20T00:00:00.000Z'),
        exitedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        stageId: 'stage-2',
        stageName: 'Proposal',
        enteredAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    ],
    createdById: 'user-1',
    createdAt: new Date('2026-02-15T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
    ...overrides,
  };
}

function buildCompany(overrides: Partial<Company> = {}): Company {
  return {
    _id: 'company-1',
    organizationId: 'org-1',
    name: 'Acme Inc',
    type: 'prospect',
    tags: [],
    customFields: {},
    contactCount: 2,
    dealCount: 1,
    totalDealValue: 30000,
    wonDealValue: 0,
    totalActivities: 2,
    createdById: 'user-1',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
    ...overrides,
  };
}

function buildPipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    _id: 'pipeline-1',
    organizationId: 'org-1',
    name: 'Revenue',
    description: 'Sales pipeline',
    isDefault: true,
    isActive: true,
    currency: 'USD',
    dealRotting: true,
    stages: [
      {
        _id: 'stage-1',
        name: 'Qualified',
        order: 0,
        probability: 30,
        color: '#1d4ed8',
        type: 'open',
        rottenDays: 7,
      },
      {
        _id: 'stage-2',
        name: 'Proposal',
        order: 1,
        probability: 55,
        color: '#7c3aed',
        type: 'open',
        rottenDays: 10,
      },
      {
        _id: 'stage-3',
        name: 'Won',
        order: 2,
        probability: 100,
        color: '#16a34a',
        type: 'won',
      },
    ],
    createdById: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

it('buildDashboardInsights prioritizes overdue tasks and pipeline imbalance', () => {
  const insights = buildDashboardInsights(
    {
      contacts: { total: 120, thisMonth: 18, change: 16, changeType: 'increase' },
      companies: { total: 36, thisMonth: 4, change: 8, changeType: 'increase' },
      activeDeals: { count: 10, value: 210000 },
      wonDeals: { count: 1, value: 18000 },
      lostDeals: { count: 4 },
      tasks: { total: 15, overdue: 5 },
    },
    {
      byStage: [
        { stageId: 'stage-1', stageName: 'Qualified', count: 6, value: 90000 },
        { stageId: 'stage-2', stageName: 'Proposal', count: 4, value: 120000 },
      ],
    },
    'This Month'
  );

  expect(insights[0]?.id).toBe('overdue-follow-ups');
  expect(insights[0]?.severity).toBe('high');
  expect(insights[0]?.summary || '').toMatch(/5 overdue/);
  expect(insights.some((insight) => insight.id === 'pipeline-risk')).toBe(true);
});

it('buildContactInsight creates a re-engagement recommendation for cooling leads', () => {
  const insight = buildContactInsight(
    buildContact({
      lastContactedAt: new Date('2026-03-08T00:00:00.000Z'),
      totalEmails: 5,
      status: 'prospect',
      lifecycle: 'sql',
    }),
    new Date('2026-03-20T00:00:00.000Z')
  );

  expect(insight.tone).toBe('watch');
  expect(insight.summary).toMatch(/quiet for 12 days/i);
  expect(insight.nextStep).toMatch(/follow-up/i);
  expect(insight.prompt).toMatch(/Ava Stone/);
});

it('buildDealInsight flags overdue close dates and stale stages as high risk', () => {
  const insight = buildDealInsight(
    buildDeal({
      expectedCloseDate: new Date('2026-03-15T00:00:00.000Z'),
      nextActivityAt: new Date('2026-03-16T00:00:00.000Z'),
    }),
    buildPipeline(),
    new Date('2026-03-20T00:00:00.000Z')
  );

  expect(insight.severity).toBe('high');
  expect(insight.summary).toMatch(/expected close date slipped/i);
  expect(insight.blocker).toMatch(/proposal/i);
  expect(insight.prompt).toMatch(/Expansion Renewal/);
});

it('buildContactListInsights surfaces duplicate and enrichment opportunities', () => {
  const insights = buildContactListInsights([
    buildContact({ _id: 'contact-1', email: 'ava@example.com', phone: '+15550001' }),
    buildContact({ _id: 'contact-2', email: 'AVA@example.com', firstName: 'Avery' }),
    buildContact({ _id: 'contact-3', firstName: 'Ben', lastName: 'Lake', jobTitle: undefined, companyId: undefined }),
  ]);

  expect(insights.some((insight) => insight.id === 'contact-dedupe')).toBe(true);
  expect(insights.some((insight) => insight.id === 'contact-enrichment')).toBe(true);
});

it('buildCompanyListInsights surfaces duplicate and enrichment opportunities', () => {
  const insights = buildCompanyListInsights([
    buildCompany({ _id: 'company-1', name: 'Acme Inc', domain: 'acme.com', industry: 'SaaS', website: 'https://acme.com', size: '11-50' }),
    buildCompany({ _id: 'company-2', name: 'ACME INC', domain: 'ACME.com' }),
    buildCompany({ _id: 'company-3', name: 'Northwind', domain: undefined, industry: undefined, website: undefined, size: undefined }),
  ]);

  expect(insights.some((insight) => insight.id === 'company-dedupe')).toBe(true);
  expect(insights.some((insight) => insight.id === 'company-enrichment')).toBe(true);
});
