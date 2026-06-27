import './globals.css';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter, JetBrains_Mono, Poppins } from 'next/font/google';
// import { FirebaseClientProvider } from '@/firebase/client-provider';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/theme-provider';
import QueryProvider from '@/components/providers/query-provider';
import PostHogProvider from '@/components/providers/posthog-provider';
import { I18nProvider } from '@/i18n/i18n-context';
import { getPwaMetadata, PWA_THEME_COLOR } from '@/lib/pwa/config';

// Design-system fonts (mockup spec: --font-sans "Inter", --font-mono "JetBrains Mono").
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
// Layered Neutral Surface System: Poppins 500–800 for headings (tight tracking).
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

const pwaMetadata = getPwaMetadata();

export const metadata: Metadata = {
  title: 'MontrAI - AI-Powered Content Creation',
  description: 'Create amazing content with AI',
  ...(pwaMetadata as object),
  icons: {
    ...(pwaMetadata.icons as object || {}),
    icon: '/montr_ai_logo_icon.png',
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: PWA_THEME_COLOR,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable} ${poppins.variable}`}>
      <body>
        <QueryProvider>
          {/* BetterAuth's useSession uses nanostores — no session provider needed. */}
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <I18nProvider>
              <PostHogProvider>
                {children}
                <Toaster />
              </PostHogProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryProvider>
        {process.env.NODE_ENV === 'production' && (
          <Script src="/register-sw.js" strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
