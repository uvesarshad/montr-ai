'use server';

import * as cheerio from 'cheerio';

import { generateTextWithClient } from '@/ai/client';
import { findModelById } from '@/lib/model-groups';

import { normalizeWebsiteUrl } from './onboarding-helpers';

export interface OnboardingWebsiteAnalysis {
  normalizedUrl: string;
  fetchSucceeded: boolean;
  title: string;
  description: string;
  businessName: string;
  businessType: string;
  industry: string;
  summary: string;
  targetAudience: string;
  brandTone: string;
  productsServices: string[];
  brandColors: string[];
  brandAssets: string[];
  keyMessages: string[];
  openQuestions: string[];
}

interface AnalyzeOnboardingWebsiteInput {
  website: string;
  model?: string;
}

interface WebsiteSnapshot {
  normalizedUrl: string;
  title: string;
  description: string;
  bodyText: string;
  headings: string[];
  colors: string[];
  assets: string[];
}

const DEFAULT_ANALYSIS: Omit<OnboardingWebsiteAnalysis, 'normalizedUrl' | 'title' | 'description'> = {
  fetchSucceeded: false,
  businessName: '',
  businessType: '',
  industry: '',
  summary: '',
  targetAudience: '',
  brandTone: '',
  productsServices: [],
  brandColors: [],
  brandAssets: [],
  keyMessages: [],
  openQuestions: [],
};

export async function analyzeOnboardingWebsite(
  input: AnalyzeOnboardingWebsiteInput
): Promise<OnboardingWebsiteAnalysis> {
  const normalizedUrl = normalizeWebsiteUrl(input.website);
  const snapshot = await fetchWebsiteSnapshot(normalizedUrl);

  const fallback = buildFallbackAnalysis(snapshot);
  if (!snapshot.bodyText) {
    return fallback;
  }

  const modelId = input.model || 'gemini-2.5-flash';
  const modelDef = findModelById(modelId);
  const routeHint: { sdk: 'genkit' | 'aisdk'; provider: string; keySource: 'system' } = modelDef
    ? {
        sdk: modelDef.supportsDirectApi ? 'genkit' : 'aisdk',
        provider: modelDef.provider,
        keySource: 'system',
      }
    : {
        sdk: 'genkit',
        provider: 'google',
        keySource: 'system',
      };

  try {
    const response = await generateTextWithClient({
      model: modelDef?.id || 'gemini-2.5-flash',
      system: [
        'You analyze a company website for marketing onboarding.',
        'Return ONLY valid JSON.',
        'Infer likely brand details from the supplied website snapshot.',
        'Do not invent specifics when the site does not support them; leave strings empty or arrays empty.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            'Extract the following JSON shape:',
            '{',
            '  "businessName": string,',
            '  "businessType": string,',
            '  "industry": string,',
            '  "summary": string,',
            '  "targetAudience": string,',
            '  "brandTone": string,',
            '  "productsServices": string[],',
            '  "brandColors": string[],',
            '  "brandAssets": string[],',
            '  "keyMessages": string[],',
            '  "openQuestions": string[]',
            '}',
            '',
            `Website: ${snapshot.normalizedUrl}`,
            `Title: ${snapshot.title || 'Unknown'}`,
            `Description: ${snapshot.description || 'Unknown'}`,
            `Headings: ${snapshot.headings.join(' | ') || 'None'}`,
            `Detected colors: ${snapshot.colors.join(', ') || 'None'}`,
            `Detected assets: ${snapshot.assets.join(', ') || 'None'}`,
            `Body sample: ${snapshot.bodyText}`,
          ].join('\n'),
        },
      ],
      routeHint,
      temperature: 0.2,
    });

    const parsed = parseAnalysisResponse(response);
    if (!parsed) {
      return fallback;
    }

    return {
      normalizedUrl,
      fetchSucceeded: snapshot.bodyText.length > 0,
      title: snapshot.title,
      description: snapshot.description,
      businessName: parsed.businessName || fallback.businessName,
      businessType: parsed.businessType || fallback.businessType,
      industry: parsed.industry || fallback.industry,
      summary: parsed.summary || fallback.summary,
      targetAudience: parsed.targetAudience || fallback.targetAudience,
      brandTone: parsed.brandTone || fallback.brandTone,
      productsServices: parsed.productsServices?.length ? parsed.productsServices : fallback.productsServices,
      brandColors: parsed.brandColors?.length ? parsed.brandColors : fallback.brandColors,
      brandAssets: parsed.brandAssets?.length ? parsed.brandAssets : fallback.brandAssets,
      keyMessages: parsed.keyMessages?.length ? parsed.keyMessages : fallback.keyMessages,
      openQuestions: parsed.openQuestions || [],
    };
  } catch {
    return fallback;
  }
}

async function fetchWebsiteSnapshot(normalizedUrl: string): Promise<WebsiteSnapshot> {
  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        'user-agent': 'MontrAI Onboarding/1.0 (+https://app.montr.io)',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').text().trim() ||
      $('h1').first().text().trim();

    const description =
      $('meta[name="description"]').attr('content')?.trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';

    const headings = $('h1, h2, h3')
      .toArray()
      .map((element) => $(element).text().replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12);

    const bodyText = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000);

    const colors = Array.from(
      new Set(
        (html.match(/#(?:[0-9a-fA-F]{3,8})\b/g) || [])
          .map((value) => value.toLowerCase())
          .slice(0, 8)
      )
    );

    const assets = $('img')
      .toArray()
      .map((element) => {
        const alt = $(element).attr('alt')?.trim();
        const src = $(element).attr('src')?.trim();
        if (alt) {
          return alt;
        }
        if (!src) {
          return '';
        }
        const segments = src.split('/').filter(Boolean);
        return segments[segments.length - 1] || '';
      })
      .filter(Boolean)
      .slice(0, 8);

    return {
      normalizedUrl,
      title,
      description,
      bodyText,
      headings,
      colors,
      assets,
    };
  } catch {
    return {
      normalizedUrl,
      title: '',
      description: '',
      bodyText: '',
      headings: [],
      colors: [],
      assets: [],
    };
  }
}

function buildFallbackAnalysis(snapshot: WebsiteSnapshot): OnboardingWebsiteAnalysis {
  const fallbackName = inferBusinessName(snapshot.title, snapshot.headings);

  return {
    normalizedUrl: snapshot.normalizedUrl,
    fetchSucceeded: snapshot.bodyText.length > 0,
    title: snapshot.title,
    description: snapshot.description,
    businessName: fallbackName,
    businessType: '',
    industry: '',
    summary: snapshot.description || snapshot.headings[0] || '',
    targetAudience: '',
    brandTone: '',
    productsServices: snapshot.headings.slice(0, 4),
    brandColors: snapshot.colors,
    brandAssets: snapshot.assets,
    keyMessages: snapshot.headings.slice(0, 3),
    openQuestions: snapshot.bodyText.length > 0 ? [] : ['The website could not be analyzed automatically.'],
  };
}

function inferBusinessName(title: string, headings: string[]): string {
  const candidate = title || headings[0] || '';
  if (!candidate) {
    return '';
  }

  return candidate.split('|')[0].split(' - ')[0].trim();
}

function parseAnalysisResponse(response: string): Omit<OnboardingWebsiteAnalysis, 'normalizedUrl' | 'fetchSucceeded' | 'title' | 'description'> | null {
  const match = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = match?.[1]?.trim() || response.trim();

  try {
    const parsed = JSON.parse(candidate) as Partial<OnboardingWebsiteAnalysis>;
    return {
      ...DEFAULT_ANALYSIS,
      businessName: parsed.businessName || '',
      businessType: parsed.businessType || '',
      industry: parsed.industry || '',
      summary: parsed.summary || '',
      targetAudience: parsed.targetAudience || '',
      brandTone: parsed.brandTone || '',
      productsServices: Array.isArray(parsed.productsServices) ? parsed.productsServices.filter(Boolean) : [],
      brandColors: Array.isArray(parsed.brandColors) ? parsed.brandColors.filter(Boolean) : [],
      brandAssets: Array.isArray(parsed.brandAssets) ? parsed.brandAssets.filter(Boolean) : [],
      keyMessages: Array.isArray(parsed.keyMessages) ? parsed.keyMessages.filter(Boolean) : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}
