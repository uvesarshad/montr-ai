import { it, expect } from 'vitest';

import {
  buildChatbotCorsHeaders,
  isAuthorizedChatbotOrigin,
  normalizeChatbotHost,
} from './chatbot-origin';

it('normalizeChatbotHost extracts a lowercase host from urls and bare domains', () => {
  expect(normalizeChatbotHost('https://Example.com/path')).toBe('example.com');
  expect(normalizeChatbotHost('sub.example.com/path')).toBe('sub.example.com');
  expect(normalizeChatbotHost(undefined)).toBe('');
});

it('isAuthorizedChatbotOrigin allows the configured website host', () => {
  expect(isAuthorizedChatbotOrigin({
      websiteUrl: 'https://example.com/support',
      origin: 'https://example.com',
    })).toBe(true);
});

it('isAuthorizedChatbotOrigin rejects a different host', () => {
  expect(isAuthorizedChatbotOrigin({
      websiteUrl: 'https://example.com',
      origin: 'https://evil.com',
      referer: 'https://evil.com/page',
    })).toBe(false);
});

it('isAuthorizedChatbotOrigin allows requests without browser origin metadata', () => {
  expect(isAuthorizedChatbotOrigin({
      websiteUrl: 'https://example.com',
    })).toBe(true);
});

it('buildChatbotCorsHeaders echoes the request origin for browser widgets', () => {
  expect(buildChatbotCorsHeaders('https://example.com')).toEqual({
    'Access-Control-Allow-Origin': 'https://example.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  });
});
