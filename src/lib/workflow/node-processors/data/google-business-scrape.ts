/**
 * Google Business data loader — Google Places API (New).
 *
 * Uses the Places API (New) at `places.googleapis.com/v1`. Requires an API
 * key with Places API enabled. For managing your own listings (reviews,
 * responses, hours), the separate Business Profile Performance API is
 * required — not covered here.
 *
 * Modes:
 *   search:     POST /places:searchText (free-form query, e.g. "coffee near me")
 *   nearby:     POST /places:searchNearby (by lat/lng + radius)
 *   details:    GET  /places/{placeId}
 *
 * Config:
 *   credentialId?: string        — credential key { apiKey }
 *   apiKey?: string              — direct key
 *   mode?: 'search'|'nearby'|'details'  (default 'search')
 *   query?: string               — free-text (search mode)
 *   latitude?: number
 *   longitude?: number           — required for nearby mode
 *   radiusMeters?: number        — default 5000, cap 50000
 *   placeId?: string             — required for details mode
 *   languageCode?: string        — BCP-47, default 'en'
 *   regionCode?: string          — ISO 3166-1 alpha-2, e.g. 'US'
 *   maxResults?: number          — cap 20 (API hard limit)
 *   fieldMask?: string           — comma-separated fields (override default)
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { safeOutboundFetch } from '../../ssrf-guard';

const BASE = 'https://places.googleapis.com/v1';
const DEFAULT_FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,' +
  'places.userRatingCount,places.types,places.websiteUri,places.nationalPhoneNumber,' +
  'places.internationalPhoneNumber,places.googleMapsUri,places.businessStatus,' +
  'places.currentOpeningHours,places.regularOpeningHours,places.priceLevel';

const DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,location,rating,userRatingCount,types,websiteUri,' +
  'nationalPhoneNumber,internationalPhoneNumber,googleMapsUri,businessStatus,' +
  'currentOpeningHours,regularOpeningHours,priceLevel,reviews,photos,editorialSummary';

export class GoogleBusinessScrapeProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, credentials } = context;
    const cred = (config.credentialId && credentials?.[config.credentialId as string]) as Record<string, unknown> | undefined;
    const apiKey = ((cred?.apiKey as string | undefined) || (cred?.key as string | undefined) || (config.apiKey as string | undefined) || '').trim();
    if (!apiKey) throw new Error('Google Business: API key is required');

    const mode = String(config.mode || 'search');
    const languageCode = String(config.languageCode || 'en');
    const regionCode = config.regionCode ? String(config.regionCode) : undefined;
    const maxResults = Math.max(1, Math.min(Number(config.maxResults) || 10, 20));

    if (mode === 'details') {
      const placeId = String(config.placeId || '').trim();
      if (!placeId) throw new Error('Google Business: "placeId" is required in details mode');
      const url = `${BASE}/places/${encodeURIComponent(placeId)}`;
      const data = await fetchGoogle(url, apiKey, String(config.fieldMask || DETAILS_FIELD_MASK), 'GET');
      return { success: true, mode, place: data };
    }

    if (mode === 'nearby') {
      const lat = Number(config.latitude);
      const lng = Number(config.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Google Business: latitude/longitude required for nearby mode');
      }
      const radius = Math.max(1, Math.min(Number(config.radiusMeters) || 5000, 50000));
      const body: Record<string, unknown> = {
        maxResultCount: maxResults,
        languageCode,
        ...(regionCode ? { regionCode } : {}),
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
        ...(config.includedTypes ? { includedTypes: config.includedTypes } : {}),
      };
      const data = await fetchGoogle(
        `${BASE}/places:searchNearby`,
        apiKey,
        String(config.fieldMask || DEFAULT_FIELD_MASK),
        'POST',
        body
      );
      const places = data.places as unknown[] | undefined;
      return {
        success: true,
        mode,
        count: places?.length || 0,
        places: places || [],
      };
    }

    // search (text)
    const query = String(config.query || '').trim();
    if (!query) throw new Error('Google Business: "query" is required in search mode');
    const body: Record<string, unknown> = {
      textQuery: query,
      maxResultCount: maxResults,
      languageCode,
      ...(regionCode ? { regionCode } : {}),
    };
    if (Number.isFinite(Number(config.latitude)) && Number.isFinite(Number(config.longitude))) {
      body.locationBias = {
        circle: {
          center: {
            latitude: Number(config.latitude),
            longitude: Number(config.longitude),
          },
          radius: Math.max(1, Math.min(Number(config.radiusMeters) || 5000, 50000)),
        },
      };
    }
    const data = await fetchGoogle(
      `${BASE}/places:searchText`,
      apiKey,
      String(config.fieldMask || DEFAULT_FIELD_MASK),
      'POST',
      body
    );
    const places = data.places as unknown[] | undefined;
    return {
      success: true,
      mode,
      query,
      count: places?.length || 0,
      places: places || [],
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.credentialId && !config.apiKey) errors.push('credentialId or apiKey is required');
    const mode = String(config.mode || 'search');
    if (mode === 'search' && !config.query) errors.push('query is required in search mode');
    if (mode === 'details' && !config.placeId) errors.push('placeId is required in details mode');
    if (mode === 'nearby' && (config.latitude == null || config.longitude == null)) {
      errors.push('latitude and longitude are required in nearby mode');
    }
    return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
  }
}

async function fetchGoogle(
  url: string,
  apiKey: string,
  fieldMask: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  const res = await safeOutboundFetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const errData = data?.error as Record<string, unknown> | undefined;
    const msg = errData?.message || res.statusText;
    throw new Error(`Google Places: ${res.status} — ${msg}`);
  }
  return data;
}
