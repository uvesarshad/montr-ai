/**
 * Custom Next.js Server with Socket.io
 *
 * Run with: node server.js
 * This enables WebSocket support for real-time workflow execution updates.
 */

// Load env before anything else — `node server.js` runs before Next loads .env,
// so Sentry.init below needs dotenv to see SENTRY_DSN. dotenv is a dependency.
require('dotenv').config();

// Initialize Sentry as early as possible. An empty DSN is a safe no-op.
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
});

// Capture process-level failures so they reach Sentry before the process dies.
process.on('unhandledRejection', (e) => Sentry.captureException(e));
process.on('uncaughtException', (e) => { Sentry.captureException(e); });

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const {
  buildAppUrl,
  buildProxyHeaders,
  shouldDisconnectForStatus,
  resolveHandshakeSession,
} = require('./server/chatbot-socket');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const portArg = process.argv.find(arg => !isNaN(arg)) || (process.argv.indexOf('--port') !== -1 ? process.argv[process.argv.indexOf('--port') + 1] : null) || (process.argv.indexOf('-p') !== -1 ? process.argv[process.argv.indexOf('-p') + 1] : null);
const port = parseInt(portArg || process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      Sentry.captureException(err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  // Initialize Socket.io
  const io = new Server(server, {
    path: '/api/socket',
    cors: {
      origin: true,
      credentials: false,
    },
  });

  // Store io instance globally for access in API routes
  global.io = io;

  // Subscribe to cross-process voice events from the voice-ws-server (Q3 c).
  // Best-effort: if Redis is not configured (dev), subscribeVoiceEvents
  // returns null and we silently skip. Voice events still work in-process.
  try {
    // Lazy require so non-voice deploys don't pull TS through the launcher.
    require('tsx/cjs');
    const { subscribeVoiceEvents } = require('./src/lib/voice/events');
    const sub = subscribeVoiceEvents(io);
    if (sub) {
      console.log('[Voice] Subscribed to cross-process voice events via Redis');
    }
  } catch (err) {
    console.warn('[Voice] subscribeVoiceEvents skipped:', err && err.message);
  }

  // Bridge cross-process notifications into Socket.IO and start the dispatcher
  // that turns domain events (failures, approvals, escalations) into user
  // notifications. Best-effort: degrades gracefully without Redis.
  try {
    require('tsx/cjs');
    const { subscribeNotificationEvents } = require('./src/lib/notifications/notification-bus');
    subscribeNotificationEvents(io);
    const { initNotificationDispatcher } = require('./src/lib/notifications/notification-dispatcher');
    initNotificationDispatcher();
    console.log('[Notifications] Socket bridge + dispatcher initialized');
  } catch (err) {
    console.warn('[Notifications] init skipped:', err && err.message);
  }

  // Agent mission triggers (Phase 2 2026-06-05): fire missions from CRM +
  // domain events (forms, WhatsApp, inbox, escalations, ad leads, meetings).
  try {
    const { registerMissionTriggerSubscriber } = require('./src/lib/agent/mission-trigger-service');
    registerMissionTriggerSubscriber();
    console.log('[Agent] Mission trigger subscribers registered');
  } catch (err) {
    console.warn('[Agent] mission trigger init skipped:', err && err.message);
  }

  // Handshake auth: resolve the NextAuth session from the connection cookie and
  // stash it on `socket.data.auth`. We do NOT reject anonymous handshakes here —
  // the embeddable chatbot widget connects cross-site with no app session and
  // authenticates separately via `chatbot:join`. Instead, the privileged room
  // joins below require `socket.data.auth` and enforce per-tenant ownership, so
  // an unauthenticated socket can never subscribe to another user's/tenant's
  // events.
  io.use(async (socket, nextFn) => {
    try {
      socket.data.auth = await resolveHandshakeSession(port, socket.handshake);
    } catch {
      socket.data.auth = null;
    }
    nextFn();
  });

  // Wrap an async socket handler so a rejected promise is reported to Sentry
  // instead of becoming an unhandled rejection.
  const wrap = (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      Sentry.captureException(err);
    }
  };

  io.on('connection', (socket) => {
    console.log('[Socket] Client connected:', socket.id);

    // Surface transport-level socket errors to Sentry.
    socket.on('error', (err) => Sentry.captureException(err));

    // Join a workflow room to receive updates for specific workflows.
    // Authenticated sessions only — events in this room can carry another
    // tenant's execution data, so anonymous sockets must not subscribe.
    socket.on('join:workflow', (workflowId) => {
      if (!socket.data.auth) return;
      if (typeof workflowId !== 'string' || workflowId.length === 0) return;
      socket.join(`workflow:${workflowId}`);
      console.log(`[Socket] Client ${socket.id} joined workflow:${workflowId}`);
    });

    // Leave a workflow room
    socket.on('leave:workflow', (workflowId) => {
      socket.leave(`workflow:${workflowId}`);
      console.log(`[Socket] Client ${socket.id} left workflow:${workflowId}`);
    });

    // Join an execution room to receive updates for specific executions.
    // Authenticated sessions only (same rationale as join:workflow).
    socket.on('join:execution', (executionId) => {
      if (!socket.data.auth) return;
      if (typeof executionId !== 'string' || executionId.length === 0) return;
      socket.join(`execution:${executionId}`);
      console.log(`[Socket] Client ${socket.id} joined execution:${executionId}`);
    });

    // Leave an execution room
    socket.on('leave:execution', (executionId) => {
      socket.leave(`execution:${executionId}`);
      console.log(`[Socket] Client ${socket.id} left execution:${executionId}`);
    });

    // Join a voice call room to receive live call lifecycle + transcript
    // segments. Authenticated sessions only — transcripts are tenant data.
    socket.on('join:voice-call', (callSessionId) => {
      if (!socket.data.auth) return;
      if (typeof callSessionId !== 'string' || callSessionId.length === 0) return;
      socket.join(`voice:call:${callSessionId}`);
      console.log(`[Socket] Client ${socket.id} joined voice:call:${callSessionId}`);
    });

    socket.on('leave:voice-call', (callSessionId) => {
      if (typeof callSessionId !== 'string' || callSessionId.length === 0) return;
      socket.leave(`voice:call:${callSessionId}`);
      console.log(`[Socket] Client ${socket.id} left voice:call:${callSessionId}`);
    });

    // Join a per-user notifications room to receive live notifications.
    // Authorization: a socket may ONLY join its OWN user room. We ignore the
    // client-supplied userId and bind to the authenticated session user, so a
    // logged-in user can never subscribe to someone else's notifications.
    socket.on('notifications:join', () => {
      const auth = socket.data.auth;
      if (!auth) return;
      socket.join(`user:${auth.userId}`);
      console.log(`[Socket] Client ${socket.id} joined user:${auth.userId}`);
    });

    socket.on('notifications:leave', () => {
      const auth = socket.data.auth;
      if (!auth) return;
      socket.leave(`user:${auth.userId}`);
    });

    socket.on('chatbot:join', wrap(async (data = {}) => {
      const origin = socket.handshake.headers.origin;
      const referer = socket.handshake.headers.referer;

      try {
        const response = await fetch(buildAppUrl(port, '/api/chatbot/validate'), {
          method: 'POST',
          headers: buildProxyHeaders({ origin, referer }),
          body: JSON.stringify({
            widgetToken: data.widgetToken,
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          socket.emit('chatbot:error', {
            message: payload.error || 'Chatbot connection failed.',
          });

          if (shouldDisconnectForStatus(response.status)) {
            return socket.disconnect(true);
          }

          return;
        }

        const room = `chatbot:${data.sessionId}`;
        socket.join(room);
        socket.data.chatbotSessionId = data.sessionId;
        socket.data.chatbotWidgetToken = data.widgetToken;
        console.log(`[Socket] Chatbot connected to ${room}`);
      } catch (error) {
        console.error('[Socket] Chatbot join error:', error);
        socket.emit('chatbot:error', {
          message: 'Chatbot connection failed.',
        });
      }
    }));

    socket.on('chatbot:message', wrap(async (data = {}) => {
      const origin = socket.handshake.headers.origin;
      const referer = socket.handshake.headers.referer;

      try {
        const response = await fetch(buildAppUrl(port, '/api/chatbot/message'), {
          method: 'POST',
          headers: buildProxyHeaders({ origin, referer }),
          body: JSON.stringify({
            sessionId: data.sessionId,
            widgetToken: data.widgetToken,
            content: data.content,
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          socket.emit('chatbot:error', {
            message: payload.error || 'Unable to process chatbot message.',
          });

          if (shouldDisconnectForStatus(response.status)) {
            socket.disconnect(true);
          }

          return;
        }

        if (payload.reply) {
          socket.emit('chatbot:message', {
            content: payload.reply,
            conversationId: payload.conversationId,
          });
        }
      } catch (error) {
        console.error('[Socket] Chatbot message error:', error);
        socket.emit('chatbot:error', {
          message: 'Unable to process chatbot message.',
        });
      }
    }));

    socket.on('disconnect', () => {
      console.log('[Socket] Client disconnected:', socket.id);
    });
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> Socket.io ready on path /api/socket`);
  });
});
