import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAppUrl,
  buildProxyHeaders,
  shouldDisconnectForStatus,
} from './chatbot-socket.js';

test('buildAppUrl targets the local next server', () => {
  assert.equal(buildAppUrl(9002, '/api/chatbot/message'), 'http://127.0.0.1:9002/api/chatbot/message');
});

test('buildProxyHeaders forwards origin metadata for chatbot validation', () => {
  assert.deepEqual(
    buildProxyHeaders({
      origin: 'https://example.com',
      referer: 'https://example.com/page',
    }),
    {
      'Content-Type': 'application/json',
      origin: 'https://example.com',
      referer: 'https://example.com/page',
    },
  );
});

test('shouldDisconnectForStatus marks auth and lookup failures as terminal', () => {
  assert.equal(shouldDisconnectForStatus(403), true);
  assert.equal(shouldDisconnectForStatus(404), true);
  assert.equal(shouldDisconnectForStatus(500), false);
});
