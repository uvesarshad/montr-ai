/**
 * Chatbot rate limiter.
 * Uses an in-memory store in dev/single-instance deploys.
 * For multi-instance production, swap the store with Redis INCR + EXPIRE.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// session-level: 30 messages per 60 seconds
const SESSION_LIMIT = 30;
const SESSION_WINDOW_MS = 60_000;

// bot-level daily cap: stored per botId + date key
const sessionStore = new Map<string, RateLimitEntry>();

function cleanupExpired(store: Map<string, RateLimitEntry>) {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkSessionRateLimit(sessionId: string): RateLimitResult {
  const now = Date.now();
  const key = `sess:${sessionId}`;

  // Periodic cleanup (every ~100 calls)
  if (Math.random() < 0.01) cleanupExpired(sessionStore);

  const entry = sessionStore.get(key);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + SESSION_WINDOW_MS;
    sessionStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: SESSION_LIMIT - 1, resetAt };
  }

  if (entry.count >= SESSION_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: SESSION_LIMIT - entry.count, resetAt: entry.resetAt };
}

export function checkBotDailyCap(botId: string, cap: number): RateLimitResult {
  if (!cap || cap <= 0) return { allowed: true, remaining: Infinity, resetAt: 0 };

  const now = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `bot:${botId}:${todayKey}`;

  const midnight = new Date();
  midnight.setUTCHours(24, 0, 0, 0);
  const resetAt = midnight.getTime();

  const entry = sessionStore.get(key);

  if (!entry || entry.resetAt < now) {
    sessionStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: cap - 1, resetAt };
  }

  if (entry.count >= cap) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: cap - entry.count, resetAt: entry.resetAt };
}
