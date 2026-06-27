function buildAppUrl(port, path) {
  return `http://127.0.0.1:${port}${path}`;
}

function buildProxyHeaders({ origin, referer }) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (origin) {
    headers.origin = origin;
  }

  if (referer) {
    headers.referer = referer;
  }

  return headers;
}

function shouldDisconnectForStatus(status) {
  return status === 401 || status === 403 || status === 404;
}

/**
 * Resolve the authenticated NextAuth session for a Socket.IO handshake.
 *
 * The browser sends its session cookie on the same-origin WebSocket upgrade,
 * but Socket.IO never reads it for us. We forward that cookie to the standard
 * NextAuth `/api/auth/session` endpoint (in-process, over loopback) and read
 * the augmented user (`id`, `organizationId`, `role`) the session callback
 * attaches. Returns `null` for anonymous/invalid handshakes.
 *
 * This mirrors the existing chatbot validation pattern (proxy to an HTTP
 * endpoint) so we don't have to pull the TS `auth()` runtime into this plain
 * JS launcher.
 */
async function resolveHandshakeSession(port, handshake) {
  const cookie = handshake && handshake.headers && handshake.headers.cookie;
  if (!cookie) return null;
  try {
    const response = await fetch(buildAppUrl(port, '/api/auth/session'), {
      headers: { cookie },
    });
    if (!response.ok) return null;
    const session = await response.json().catch(() => null);
    const user = session && session.user;
    if (!user || !user.id) return null;
    return {
      userId: String(user.id),
      organizationId: user.organizationId ? String(user.organizationId) : undefined,
      role: user.role,
    };
  } catch {
    return null;
  }
}

module.exports = {
  buildAppUrl,
  buildProxyHeaders,
  shouldDisconnectForStatus,
  resolveHandshakeSession,
};
