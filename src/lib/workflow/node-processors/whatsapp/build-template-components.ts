/**
 * Build full Graph API template `components` from node config (2.11).
 *
 * Previously the send-template processor only emitted positional BODY text
 * params. Meta supports HEADER (text or media: image/video/document), BODY
 * (text / currency / date_time params) and BUTTON (quick-reply payloads,
 * url-button variable suffixes) components. This helper assembles all of them
 * from a normalized node config so the processor stays declarative.
 *
 * Config shape (all optional except where a template requires them):
 *   headerType:  'none' | 'text' | 'image' | 'video' | 'document'
 *   headerText:  string                       (headerType === 'text')
 *   headerMediaUrl: string                    (image/video/document)
 *   headerMediaFilename: string               (document only)
 *   parameters:  Array<string | BodyParam>    (BODY positional params, existing)
 *   buttons:     Array<ButtonParam>           (one entry per dynamic button)
 *
 * BodyParam (object form lets a single positional param be typed):
 *   { type: 'text', text }
 *   { type: 'currency', code, amount, fallback }   // amount in major units
 *   { type: 'date_time', text }                    // rendered as fallback_value
 *
 * ButtonParam:
 *   { subType: 'quick_reply', index, payload }
 *   { subType: 'url', index, text }                // dynamic URL suffix
 */

import type {
  WhatsAppTemplateComponent,
  WhatsAppTemplateParameter,
} from '../../../services/whatsapp.service';

export type HeaderType = 'none' | 'text' | 'image' | 'video' | 'document';

export interface BodyParamObject {
  type: 'text' | 'currency' | 'date_time';
  text?: string;
  // currency
  code?: string;
  amount?: number; // major units, e.g. 12.50
  fallback?: string;
}

export interface ButtonParam {
  subType: 'quick_reply' | 'url';
  index: number;
  payload?: string; // quick_reply
  text?: string; // url variable suffix
}

export interface TemplateComponentsConfig {
  headerType?: HeaderType;
  headerText?: string;
  headerMediaUrl?: string;
  headerMediaFilename?: string;
  parameters?: Array<unknown>;
  buttons?: Array<ButtonParam | Record<string, unknown>>;
}

function buildBodyParameter(p: unknown): WhatsAppTemplateParameter {
  // Plain string / number → text param (back-compat with existing positional usage).
  if (p === null || typeof p !== 'object') {
    return { type: 'text', text: String(p ?? '') };
  }
  const obj = p as BodyParamObject & Record<string, unknown>;
  switch (obj.type) {
    case 'currency': {
      const amount = Number(obj.amount ?? 0);
      const fallback = String(obj.fallback ?? amount);
      return {
        type: 'currency',
        currency: {
          fallback_value: fallback,
          code: String(obj.code ?? 'USD'),
          amount_1000: Math.round(amount * 1000),
        },
      };
    }
    case 'date_time':
      return {
        type: 'date_time',
        date_time: { fallback_value: String(obj.text ?? obj.fallback ?? '') },
      };
    case 'text':
    default:
      return { type: 'text', text: String(obj.text ?? '') };
  }
}

export function buildTemplateComponents(
  config: TemplateComponentsConfig,
): WhatsAppTemplateComponent[] {
  const components: WhatsAppTemplateComponent[] = [];

  // HEADER --------------------------------------------------------------
  const headerType = (config.headerType ?? 'none') as HeaderType;
  if (headerType === 'text' && config.headerText) {
    components.push({
      type: 'header',
      parameters: [{ type: 'text', text: String(config.headerText) }],
    });
  } else if (
    (headerType === 'image' || headerType === 'video' || headerType === 'document') &&
    config.headerMediaUrl
  ) {
    const link = String(config.headerMediaUrl);
    let param: WhatsAppTemplateParameter;
    if (headerType === 'image') param = { type: 'image', image: { link } };
    else if (headerType === 'video') param = { type: 'video', video: { link } };
    else
      param = {
        type: 'document',
        document: {
          link,
          ...(config.headerMediaFilename
            ? { filename: String(config.headerMediaFilename) }
            : {}),
        },
      };
    components.push({ type: 'header', parameters: [param] });
  }

  // BODY ----------------------------------------------------------------
  const params = Array.isArray(config.parameters) ? config.parameters : [];
  if (params.length > 0) {
    components.push({
      type: 'body',
      parameters: params.map(buildBodyParameter),
    });
  }

  // BUTTONS -------------------------------------------------------------
  const buttons = Array.isArray(config.buttons) ? config.buttons : [];
  buttons.forEach((b, i) => {
    const btn = b as ButtonParam & Record<string, unknown>;
    const subType = btn.subType === 'url' ? 'url' : 'quick_reply';
    const index = Number(btn.index ?? i);
    if (subType === 'url') {
      if (btn.text === undefined || btn.text === null || btn.text === '') return;
      components.push({
        type: 'button',
        sub_type: 'url',
        index,
        parameters: [{ type: 'text', text: String(btn.text) }],
      });
    } else {
      const payload = String(btn.payload ?? btn.text ?? '');
      if (!payload) return;
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index,
        parameters: [{ type: 'payload', payload }],
      });
    }
  });

  return components;
}
