import type { Metadata, MetadataRoute } from 'next';

export const PWA_THEME_COLOR = '#0b1020';

export function getPwaManifest(): MetadataRoute.Manifest {
  return {
    name: 'MontrAI',
    short_name: 'MontrAI',
    description: 'AI-powered workspace for content, CRM, marketing, and automation.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: PWA_THEME_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [
      {
        src: '/montr_ai_logo_icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/montr_ai_logo_icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

export function getPwaMetadata(): Metadata {
  return {
    applicationName: 'MontrAI',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'MontrAI',
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      apple: '/montr_ai_logo_icon.png',
    },
  };
}
