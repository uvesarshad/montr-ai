import { it, expect } from 'vitest';

import {
  buildChatbotConfig,
  buildChatbotEmbedSnippet,
  buildCreateChatbotPayload,
  DEFAULT_CHATBOT_MODEL,
  normalizeChatbotType,
} from './chatbots';

it('buildCreateChatbotPayload applies defaults for a new chatbot', () => {
  const payload = buildCreateChatbotPayload(
    { name: '  Support Bot  ' },
    '507f1f77bcf86cd799439011',
    '507f1f77bcf86cd799439012',
    'wgt_test',
  );

  expect(payload.name).toBe('Support Bot');
  expect(payload.channelType).toBe('website');
  expect(payload.config.widgetToken).toBe('wgt_test');
  expect(payload.config.aiModel).toBe(DEFAULT_CHATBOT_MODEL);
  expect(payload.config.chatbotType).toBe('support');
  expect(payload.config.autoTransferToHuman).toBe(true);
  expect(payload.config.preChatFormEnabled).toBe(false);
  expect(payload.config.primaryColor).toBe('#3B82F6');
  expect(payload.config.knowledgeBaseIds).toEqual([]);
});

it('buildCreateChatbotPayload preserves explicit chatbot settings', () => {
  const payload = buildCreateChatbotPayload(
    {
      name: 'Lead Bot',
      type: 'Lead Generation',
      aiModel: 'gpt-5-mini',
      knowledgeBaseIds: ['507f1f77bcf86cd799439013'],
      autoTransferToHuman: false,
      preChatFormEnabled: true,
      primaryColor: '#112233',
    },
    '507f1f77bcf86cd799439011',
    '507f1f77bcf86cd799439012',
    'wgt_test',
  );

  expect(payload.config.aiModel).toBe('gpt-5-mini');
  expect(payload.config.chatbotType).toBe('lead generation');
  expect(payload.config.autoTransferToHuman).toBe(false);
  expect(payload.config.preChatFormEnabled).toBe(true);
  expect(payload.config.primaryColor).toBe('#112233');
  expect(payload.config.knowledgeBaseIds.length).toBe(1);
});

it('buildCreateChatbotPayload rejects an empty name', () => {
  expect(() =>
      buildCreateChatbotPayload(
        { name: '   ' },
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
      )).toThrow(/Chatbot name is required/);
});

it('normalizeChatbotType converts stored values into UI labels', () => {
  expect(normalizeChatbotType('support')).toBe('Support');
  expect(normalizeChatbotType('lead generation')).toBe('Lead Generation');
  expect(normalizeChatbotType('lead_generation')).toBe('Lead Generation');
  expect(normalizeChatbotType(undefined)).toBe('Support');
});

it('buildChatbotConfig preserves widget token while rebuilding editable chatbot config', () => {
  const config = buildChatbotConfig(
    {
      widgetToken: 'ignored',
      aiModel: 'gpt-5-mini',
      type: 'FAQ',
      preChatFormEnabled: true,
      autoTransferToHuman: false,
      primaryColor: '#445566',
      knowledgeBaseIds: ['507f1f77bcf86cd799439013'],
    },
    'wgt_existing',
  );

  expect(config.widgetToken).toBe('wgt_existing');
  expect(config.aiModel).toBe('gpt-5-mini');
  expect(config.chatbotType).toBe('faq');
  expect(config.preChatFormEnabled).toBe(true);
  expect(config.autoTransferToHuman).toBe(false);
  expect(config.primaryColor).toBe('#445566');
  expect(config.knowledgeBaseIds.length).toBe(1);
});

it('buildChatbotEmbedSnippet generates widget code for a specific chatbot', () => {
  const snippet = buildChatbotEmbedSnippet({
    baseUrl: 'https://app.example.com',
    widgetToken: 'wgt_123',
    primaryColor: '#112233',
  });

  expect(snippet).toMatch(/window\.MontrAIConfig/);
  expect(snippet).toMatch(/https:\/\/app\.example\.com/);
  expect(snippet).toMatch(/wgt_123/);
  expect(snippet).toMatch(/#112233/);
  expect(snippet).toMatch(/<script defer src="https:\/\/app\.example\.com\/socket\.io\/socket\.io\.js"><\/script>/);
  expect(snippet).toMatch(/chatbot-widget\.js/);
  expect(snippet).toMatch(/<script defer src="https:\/\/app\.example\.com\/chatbot-widget\.js"><\/script>/);
});
