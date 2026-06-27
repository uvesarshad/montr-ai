'use client';

/**
 * LiveKit browser test-call widget (Phase 8 — media-plane foundation).
 *
 * ⚠️ HONEST SCAFFOLD. This widget fetches a real, org-scoped LiveKit token from
 *    `/api/v2/voice/livekit/token` and shows the room/url + token state. It does
 *    NOT establish a real WebRTC connection: the browser SDK `livekit-client` is
 *    NOT installed, and there is no LiveKit server running in this environment.
 *    So there is deliberately NO fake "Connected" UI — the furthest honest state
 *    is "token minted / ready to connect".
 *
 *    To make this actually connect: install `livekit-client`, run a LiveKit
 *    server, then replace the `// TODO(live)` block with `new Room()` +
 *    `room.connect(url, token)` and surface the real connection state.
 *
 * Composed from the ui-kit (Card / Button / Chip / Banner) — no hand-rolled UI.
 */

import { useCallback, useState } from 'react';
import { Phone, PhoneOff, AlertTriangle } from 'lucide-react';

import { Card, Button, Chip, Banner } from '@/components/ui-kit';

type TokenState =
  | { phase: 'idle' }
  | { phase: 'minting' }
  | {
      phase: 'ready';
      url: string | null;
      roomName: string;
      callSessionId: string;
      token: string;
    }
  | { phase: 'not-configured'; message: string }
  | { phase: 'error'; message: string };

export interface LiveKitTestCallProps {
  /** Optional brand scope passed to the token route. */
  brandId?: string;
  /** Optional existing call session to join (else the route creates a test one). */
  callSessionId?: string;
  className?: string;
}

export function LiveKitTestCall({ brandId, callSessionId, className }: LiveKitTestCallProps) {
  const [state, setState] = useState<TokenState>({ phase: 'idle' });

  const mint = useCallback(async () => {
    setState({ phase: 'minting' });
    try {
      const res = await fetch('/api/v2/voice/livekit/token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId, callSessionId }),
      });

      if (res.status === 501) {
        const data = await res.json().catch(() => ({}));
        setState({
          phase: 'not-configured',
          message:
            data.message ??
            'LiveKit server is not configured (LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET).',
        });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({ phase: 'error', message: data.error ?? `Request failed (${res.status})` });
        return;
      }

      const data = await res.json();
      setState({
        phase: 'ready',
        url: data.url ?? null,
        roomName: data.roomName,
        callSessionId: data.callSessionId,
        token: data.token,
      });

      // TODO(live): once `livekit-client` is installed + a server is running:
      //   import { Room } from 'livekit-client';
      //   const room = new Room();
      //   await room.connect(data.url, data.token);
      //   await room.localParticipant.setMicrophoneEnabled(true);
      //   ...surface the real connection/track state here.
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }, [brandId, callSessionId]);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return (
    <Card
      icon={Phone}
      title="LiveKit test call"
      meta="Browser ↔ room media-plane smoke test"
      className={className}
    >
      <div className="flex flex-col gap-4">
        <Banner tone="warn" icon={AlertTriangle}>
          Scaffold only. This mints a real org-scoped token but cannot connect:{' '}
          <code>livekit-client</code> is not installed and no LiveKit server is running.
          No audio flows until both are in place.
        </Banner>

        {state.phase === 'ready' && (
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Chip tone="ok">Token minted</Chip>
              <Chip>room: {state.roomName}</Chip>
            </div>
            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>URL</dt>
              <dd className="truncate font-mono">{state.url ?? '(no LIVEKIT_URL)'}</dd>
              <dt>Call session</dt>
              <dd className="truncate font-mono">{state.callSessionId}</dd>
              <dt>Token</dt>
              <dd className="truncate font-mono">{state.token.slice(0, 24)}…</dd>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Ready to connect — install <code>livekit-client</code> + run a LiveKit
              server, then wire <code>room.connect(url, token)</code> (see the
              <code> TODO(live)</code> marker in this component).
            </p>
          </div>
        )}

        {state.phase === 'not-configured' && (
          <Banner tone="info">{state.message}</Banner>
        )}

        {state.phase === 'error' && <Banner tone="danger">{state.message}</Banner>}

        <div className="flex items-center gap-2">
          {state.phase === 'ready' ? (
            <Button variant="outline" icon={PhoneOff} onClick={reset}>
              Reset
            </Button>
          ) : (
            <Button
              variant="brand"
              icon={Phone}
              onClick={mint}
              disabled={state.phase === 'minting'}
            >
              {state.phase === 'minting' ? 'Minting token…' : 'Mint test-call token'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default LiveKitTestCall;
