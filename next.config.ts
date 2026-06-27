import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// Optional bundle analyzer. Run `ANALYZE=true npm run build` to generate the
// client/server bundle reports. The package is a dev dep; we require it
// lazily so production builds without it still work.
const withBundleAnalyzer: (config: NextConfig) => NextConfig = process.env.ANALYZE === 'true'
  ? (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('@next/bundle-analyzer')({ enabled: true });
      } catch {
        console.warn('[next.config] ANALYZE=true but @next/bundle-analyzer is not installed. Run: npm i -D @next/bundle-analyzer');
        return (c: NextConfig) => c;
      }
    })()
  : (c: NextConfig) => c;

const nextConfig: NextConfig = {
  // `@ffmpeg-installer/ffmpeg` resolves a platform-specific native binary via
  // os.platform()-based dynamic require + node_modules path arithmetic, and
  // `fluent-ffmpeg` does its own dynamic requires — neither can be bundled by
  // webpack. Keep them external so they're required at runtime from node_modules
  // (used by the AI slideshow→video pipeline, src/lib/social/video/slideshow.ts).
  serverExternalPackages: ['bullmq', 'ioredis', '@opentelemetry/api', '@opentelemetry/instrumentation', 'onnxruntime-node', '@huggingface/transformers', 'livekit-server-sdk', 'langfuse', '@ffmpeg-installer/ffmpeg', 'fluent-ffmpeg'],
  experimental: {
    serverActions: {
      bodySizeLimit: '4.5mb',
    },
  },
  // typescript.ignoreBuildErrors and eslint.ignoreDuringBuilds were previously
  // set to true and hid real defects from production builds. They are now
  // disabled (default = false). Expect `npm run build` to surface accumulated
  // type/lint errors; clean those up in F1a (see temp/AUDIT_TASKS.md).
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  async redirects() {
    // Canonical surfaces locked 2026-05-22 (B3-4):
    //   /inbox      — omnichannel 1:1 (WhatsApp, email, social DM, voice)
    //   /campaigns  — 1:many marketing sends across channels
    //   /workflows  — unified-workflow editor (already canonical via B2)
    // Old paths redirect here. Channel-specific duplicates carry their channel
    // as a query string so the canonical UI can pre-set its filter.
    //
    // See temp/audit/route-map.md for the full table.
    return [
      // --- Inbox ---
      { source: '/conversations', destination: '/inbox', permanent: false },
      { source: '/conversations/:path*', destination: '/inbox/:path*', permanent: false },
      { source: '/crm/inbox', destination: '/inbox', permanent: false },
      { source: '/crm/inbox/:path*', destination: '/inbox/:path*', permanent: false },
      { source: '/crm/whatsapp/inbox', destination: '/inbox?channel=whatsapp', permanent: false },
      { source: '/marketing/whatsapp/inbox', destination: '/inbox?channel=whatsapp', permanent: false },

      // --- Campaigns ---
      { source: '/marketing', destination: '/campaigns', permanent: false },
      { source: '/marketing/email', destination: '/campaigns?channel=email', permanent: false },
      { source: '/marketing/email/campaigns', destination: '/campaigns?channel=email', permanent: false },
      { source: '/marketing/email/dashboard', destination: '/campaigns/dashboard?channel=email', permanent: false },
      { source: '/marketing/email/providers', destination: '/campaigns/providers?channel=email', permanent: false },
      { source: '/marketing/email/templates', destination: '/campaigns/templates?channel=email', permanent: false },
      { source: '/marketing/email/templates/new', destination: '/campaigns/templates/new?channel=email', permanent: false },
      { source: '/crm/marketing-email', destination: '/campaigns?channel=email', permanent: false },
      { source: '/crm/marketing-email/:path*', destination: '/campaigns/:path*?channel=email', permanent: false },
      { source: '/marketing/whatsapp', destination: '/campaigns?channel=whatsapp', permanent: false },
      { source: '/marketing/whatsapp/campaigns', destination: '/campaigns?channel=whatsapp', permanent: false },
      { source: '/marketing/whatsapp/templates', destination: '/campaigns/templates?channel=whatsapp', permanent: false },
      { source: '/marketing/whatsapp/analytics', destination: '/campaigns/analytics?channel=whatsapp', permanent: false },
      { source: '/marketing/whatsapp/settings', destination: '/campaigns/settings?channel=whatsapp', permanent: false },
      { source: '/crm/whatsapp/campaigns', destination: '/campaigns?channel=whatsapp', permanent: false },
      { source: '/crm/whatsapp/templates', destination: '/campaigns/templates?channel=whatsapp', permanent: false },
      { source: '/crm/whatsapp/analytics', destination: '/campaigns/analytics?channel=whatsapp', permanent: false },
      { source: '/crm/whatsapp/settings', destination: '/campaigns/settings?channel=whatsapp', permanent: false },
      { source: '/crm/whatsapp', destination: '/campaigns?channel=whatsapp', permanent: false },

      // --- Workflows ---
      { source: '/crm/workflows', destination: '/workflows', permanent: false },
      { source: '/crm/workflows/:path*', destination: '/workflows/:path*', permanent: false },
      { source: '/marketing/whatsapp/automation', destination: '/workflows', permanent: false },
      { source: '/marketing/whatsapp/automation/:path*', destination: '/workflows/:path*', permanent: false },
      { source: '/crm/whatsapp/automation', destination: '/workflows', permanent: false },
      { source: '/crm/whatsapp/automation/:path*', destination: '/workflows/:path*', permanent: false },

      // --- Contact-scoped channel views ---
      { source: '/marketing/whatsapp/contacts', destination: '/crm/contacts?channel=whatsapp', permanent: false },
      { source: '/crm/whatsapp/contacts', destination: '/crm/contacts?channel=whatsapp', permanent: false },
    ];
  },
  // Baseline security headers. Applied to every response so that browsers
  // enforce TLS, refuse MIME-sniffing, restrict referrer leakage, and disable
  // sensitive browser APIs by default. CSP is deliberately minimal — tighten
  // it once we know which inline scripts/styles each surface uses.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
  // Image optimizer config. Previously `hostname: '**'` accepted any HTTPS host
  // and `dangerouslyAllowSVG: true` let the optimizer proxy SVGs (which can
  // carry XSS). Locked down to known-good CDNs and external sources; add new
  // hosts here when integrations need them rather than wildcarding.
  images: {
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // Placeholders / stock images
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      // OAuth / social provider avatars + media
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'abs.twimg.com' },
      { protocol: 'https', hostname: 'platform-lookaside.fbsbx.com' },
      { protocol: 'https', hostname: 'scontent.cdninstagram.com' },
      { protocol: 'https', hostname: 'media.licdn.com' },
      // Our own storage (Wasabi/S3) — host varies by region/bucket, so allow
      // the public S3 family; runtime URLs come from our own signing code so
      // there's no untrusted-input path to choose the bucket.
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      { protocol: 'https', hostname: 's3.*.amazonaws.com' },
      { protocol: 'https', hostname: '*.s3.*.amazonaws.com' },
      { protocol: 'https', hostname: '*.wasabisys.com' },
      { protocol: 'https', hostname: 's3.wasabisys.com' },
      { protocol: 'https', hostname: '*.cloudfront.net' },
    ],
  },
  webpack(config) {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@opentelemetry\/instrumentation\/build\/esm\/platform\/node\/instrumentation\.js/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    return config;
  },
};

// Sentry build-time integration: instruments the build, uploads source maps
// (only when SENTRY_AUTH_TOKEN is present — otherwise the plugin no-ops with a
// warning), and tree-shakes Sentry logger statements. Composed OUTSIDE the
// bundle-analyzer wrapper so analyzer reports reflect the final bundle.
//
// NOTE: `tunnelRoute` (a same-origin proxy that defeats ad-blockers) is
// intentionally NOT enabled yet — `/monitoring` would pass through
// `middleware.ts`, whose auth/CSRF rules could redirect or block the
// unauthenticated client-error POST. Enable it only after allowlisting the
// route in middleware. See docs/plan/observability-posthog-sentry-todo-2026-06-16.md.
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
});
