import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Set environment
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,

    // env-driven sample rate (NEXT_PUBLIC_* are the only client-readable vars)
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

    // Enable debug in development
    debug: process.env.NODE_ENV === 'development',

    // Never send default PII (IP, request headers, etc.)
    sendDefaultPii: false,

    // Session replay
    integrations: [
        Sentry.replayIntegration(),
    ],
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,

    // Filter out noisy errors
    ignoreErrors: [
        // Random plugins/extensions
        'top.GLOBALS',
        // Chrome extensions
        /extensions\//i,
        /^chrome:\/\//i,
        // Network errors
        'Network request failed',
        'Failed to fetch',
        'NetworkError',
        // Aborted requests
        'AbortError',
    ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
