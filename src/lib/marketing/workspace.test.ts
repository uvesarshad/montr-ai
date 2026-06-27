
import { it, expect } from 'vitest';
import {
  buildMarketingWorkspace,
  marketingSidebarSections,
  type MarketingWorkspaceInput,
} from './workspace';

it('buildMarketingWorkspace creates scorecards and priorities from live marketing data', () => {
  const input: MarketingWorkspaceInput = {
    brandName: 'Acme',
    hasBrands: true,
    totalAutomations: 8,
    activeAutomations: 3,
    connectedProviders: 2,
    connectedWhatsAppAccounts: 1,
    openWhatsAppConversations: 14,
    report: {
      period: '30d',
      social: {
        totalPosts: 12,
        totalEngagement: 1640,
        avgEngagementRate: 4.8,
        momentum: 18,
        topPlatform: 'LinkedIn',
        topPostPreview: 'How Acme cut response time with AI-assisted routing.',
      },
      email: {
        campaignsSent: 5,
        totalSent: 4200,
        totalOpened: 2150,
        totalClicked: 390,
        totalBounced: 32,
        avgOpenRate: 51.19,
        avgClickRate: 9.29,
      },
      whatsapp: {
        campaignsSent: 9,
        totalSent: 5800,
        totalDelivered: 5570,
        totalRead: 4310,
        totalFailed: 70,
        deliveryRate: 96.03,
        readRate: 77.38,
      },
      summary: 'Cross-channel report for the last 30 days.',
    },
    roadmap: {
      currentLevel: 3,
      currentXp: 180,
      tasks: [
        { id: 'task-1', title: 'Refresh WhatsApp broadcast sequence', status: 'in_progress', xpReward: 40, type: 'campaign', description: 'Tighten the follow-up timing.' },
        { id: 'task-2', title: 'Launch April reactivation email', status: 'pending', xpReward: 30, type: 'email', description: 'Target dormant leads.' },
        { id: 'task-3', title: 'Review weekly performance report', status: 'completed', xpReward: 10, type: 'analytics', description: 'Close the feedback loop.' },
      ],
    },
  };

  const workspace = buildMarketingWorkspace(input);

  expect(workspace.hero.title).toBe('Marketing command center');
  expect(workspace.hero.summary).toMatch(/Acme/);
  expect(workspace.scorecards[0]?.label).toBe('Active automations');
  expect(workspace.scorecards[0]?.value).toBe('3');
  expect(workspace.scorecards[1]?.value).toBe('51.2%');
  expect(workspace.scorecards[2]?.value).toBe('96.0%');
  expect(workspace.scorecards[3]?.value).toBe('33%');
  expect(workspace.priorities[0]?.title).toBe('Refresh WhatsApp broadcast sequence');
  expect(workspace.channels[0]?.href).toBe('/marketing/whatsapp');
  expect(workspace.channels[1]?.href).toBe('/marketing/email');
  expect(workspace.channels[2]?.href).toBe('/canvas');
});

it('buildMarketingWorkspace falls back to setup guidance when no brand is connected yet', () => {
  const workspace = buildMarketingWorkspace({
    brandName: null,
    hasBrands: false,
    totalAutomations: 0,
    activeAutomations: 0,
    connectedProviders: 0,
    connectedWhatsAppAccounts: 0,
    openWhatsAppConversations: 0,
    report: null,
    roadmap: null,
  });

  expect(workspace.hero.summary).toMatch(/connect your first brand/i);
  expect(workspace.scorecards[0]?.value).toBe('0');
  expect(workspace.scorecards[1]?.value).toBe('0%');
  expect(workspace.scorecards[2]?.value).toBe('0%');
  expect(workspace.scorecards[3]?.value).toBe('0%');
  expect(workspace.priorities[0]?.title).toBe('Connect a brand workspace');
  expect(workspace.priorities[0]?.href).toBe('/settings');
});

it('marketingSidebarSections expose overview, channel, and automation destinations', () => {
  expect(marketingSidebarSections[0]?.items[0]?.href).toBe('/marketing');
  expect(marketingSidebarSections[1]?.items[0]?.href).toBe('/marketing/whatsapp');
  expect(marketingSidebarSections[1]?.items[1]?.href).toBe('/marketing/email');
  expect(marketingSidebarSections[2]?.items[0]?.href).toBe('/canvas');
});
