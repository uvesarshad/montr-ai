/**
 * Pinterest data loader — Pinterest API v5.
 *
 * Requires a Pinterest OAuth access token with appropriate scopes:
 *   boards:read, pins:read, user_accounts:read
 *
 * Modes:
 *   me:          GET /v5/user_account
 *   boards:      GET /v5/boards
 *   board_pins:  GET /v5/boards/{boardId}/pins
 *   user_pins:   GET /v5/pins (authenticated user's pins)
 *   pin:         GET /v5/pins/{pinId}
 *
 * Config:
 *   credentialId?: string     — credential key { accessToken }
 *   accessToken?: string      — direct bearer token
 *   mode?: 'me'|'boards'|'board_pins'|'user_pins'|'pin' (default 'user_pins')
 *   boardId?: string          — required for board_pins
 *   pinId?: string            — required for pin mode
 *   pageSize?: number         — default 25, cap 100
 *   bookmark?: string         — pagination cursor (returned as `bookmark`)
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const API = 'https://api.pinterest.com/v5';
type Mode = 'me' | 'boards' | 'board_pins' | 'user_pins' | 'pin';
const VALID_MODES: readonly Mode[] = ['me', 'boards', 'board_pins', 'user_pins', 'pin'];

export class PinterestScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const token = ((cred?.accessToken as string | undefined) || (cred?.token as string | undefined) || (config.accessToken as string | undefined) || '').trim();
    if (!token) throw new Error('Pinterest: access token is required');

    const configMode = config.mode as string | undefined;
    const mode: Mode = (configMode && VALID_MODES.includes(configMode as Mode)) ? (configMode as Mode) : 'user_pins';
    const pageSize = Math.max(1, Math.min(Number(config.pageSize) || 25, 100));
    const bookmark = config.bookmark ? `&bookmark=${encodeURIComponent(String(config.bookmark))}` : '';

    if (mode === 'me') {
      const data = await fetchPin(`${API}/user_account`, token);
      return { success: true, mode, account: data };
    }

    if (mode === 'pin') {
      const pinId = String(config.pinId || '').trim();
      if (!pinId) throw new Error('Pinterest: "pinId" is required in pin mode');
      const data = await fetchPin(`${API}/pins/${encodeURIComponent(pinId)}`, token);
      return { success: true, mode, pin: data };
    }

    if (mode === 'boards') {
      const data = await fetchPin(`${API}/boards?page_size=${pageSize}${bookmark}`, token);
      const items = data.items as unknown[] | undefined;
      return {
        success: true,
        mode,
        count: items?.length || 0,
        bookmark: data.bookmark,
        boards: items || [],
      };
    }

    if (mode === 'board_pins') {
      const boardId = String(config.boardId || '').trim();
      if (!boardId) throw new Error('Pinterest: "boardId" is required in board_pins mode');
      const data = await fetchPin(
        `${API}/boards/${encodeURIComponent(boardId)}/pins?page_size=${pageSize}${bookmark}`,
        token
      );
      const items = data.items as unknown[] | undefined;
      return {
        success: true,
        mode,
        boardId,
        count: items?.length || 0,
        bookmark: data.bookmark,
        pins: items || [],
      };
    }

    // user_pins
    const data = await fetchPin(`${API}/pins?page_size=${pageSize}${bookmark}`, token);
    const items = data.items as unknown[] | undefined;
    return {
      success: true,
      mode,
      count: items?.length || 0,
      bookmark: data.bookmark,
      pins: items || [],
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.accessToken) {
      errors.push('credentialId or accessToken is required');
    }
    if (config.mode && !VALID_MODES.includes(config.mode as Mode)) {
      errors.push(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }
    if (config.mode === 'board_pins' && !config.boardId) errors.push('boardId is required');
    if (config.mode === 'pin' && !config.pinId) errors.push('pinId is required');
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function fetchPin(url: string, token: string): Promise<Record<string, unknown>> {
  const res = await safeOutboundFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.message as string | undefined) || (data?.error_description as string | undefined) || res.statusText;
    throw new Error(`Pinterest API: ${res.status} — ${msg}`);
  }
  return data;
}
