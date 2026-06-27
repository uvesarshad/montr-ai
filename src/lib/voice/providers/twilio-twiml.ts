/**
 * TwiML response builders for Twilio inbound + outbound answer flows.
 *
 * Twilio's `voiceUrl` (set on the IncomingPhoneNumber resource) is hit when an
 * inbound call lands. The response body is XML — TwiML — that tells Twilio
 * what to do next (Connect to a media stream, Dial a number, Hangup, etc.).
 *
 * Implementations keep the XML hand-rolled. The Twilio Node SDK has a
 * `TwiMLResponse` builder, but it's a thin string-concat layer; rolling our
 * own keeps the dependency footprint small and lets us escape values
 * consistently with the rest of `providers/twilio.ts`.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function twimlResponse(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>${inner}</Response>`;
}

export function twimlHangup(): string {
  return twimlResponse('<Hangup/>');
}

export function twimlSay(text: string, voice = 'Polly.Joanna'): string {
  return twimlResponse(
    `<Say voice="${escapeXml(voice)}">${escapeXml(text)}</Say><Hangup/>`,
  );
}

export function twimlPlayAndHangup(audioUrl: string): string {
  return twimlResponse(`<Play>${escapeXml(audioUrl)}</Play><Hangup/>`);
}

export function twimlForward(toNumber: string, options: {
  callerId?: string;
  timeout?: number;
  recordingStatusCallback?: string;
} = {}): string {
  const attrs: string[] = [];
  if (options.callerId) attrs.push(`callerId="${escapeXml(options.callerId)}"`);
  if (options.timeout) attrs.push(`timeout="${options.timeout}"`);
  if (options.recordingStatusCallback) {
    attrs.push(`recordingStatusCallback="${escapeXml(options.recordingStatusCallback)}"`);
  }
  return twimlResponse(
    `<Dial${attrs.length ? ' ' + attrs.join(' ') : ''}>${escapeXml(toNumber)}</Dial>`,
  );
}

export function twimlVoicemail(options: {
  greeting?: string;
  maxLengthSec?: number;
  recordingStatusCallback?: string;
}): string {
  const greeting = options.greeting
    ? `<Say>${escapeXml(options.greeting)}</Say>`
    : '<Say>Please leave a message after the beep.</Say>';
  const attrs: string[] = [
    `maxLength="${options.maxLengthSec ?? 120}"`,
    `playBeep="true"`,
    `finishOnKey="#"`,
  ];
  if (options.recordingStatusCallback) {
    attrs.push(`recordingStatusCallback="${escapeXml(options.recordingStatusCallback)}"`);
  }
  return twimlResponse(`${greeting}<Record ${attrs.join(' ')} />`);
}

/**
 * Voicemail drop: leave a pre-recorded message (or spoken text) on an
 * answering machine, then hang up. Used by the campaign engine when AMD
 * reports `result === 'machine'`. Prefers `audioUrl` over `message`.
 */
export function buildVoicemailDropTwiml(opts: {
  message?: string;
  audioUrl?: string;
}): string {
  const inner = opts.audioUrl
    ? `<Play>${escapeXml(opts.audioUrl)}</Play>`
    : `<Say>${escapeXml(opts.message ?? '')}</Say>`;
  return twimlResponse(`${inner}<Hangup/>`);
}

export function twimlConnectMediaStream(
  streamWssUrl: string,
  customParameters: Record<string, string> = {},
): string {
  const params = Object.entries(customParameters)
    .map(
      ([name, value]) =>
        `<Parameter name="${escapeXml(name)}" value="${escapeXml(value)}"/>`,
    )
    .join('');
  return twimlResponse(
    `<Connect><Stream url="${escapeXml(streamWssUrl)}">${params}</Stream></Connect>`,
  );
}

export function twimlGreetingAndPause(text: string): string {
  return twimlResponse(`<Say>${escapeXml(text)}</Say><Pause length="60"/>`);
}
