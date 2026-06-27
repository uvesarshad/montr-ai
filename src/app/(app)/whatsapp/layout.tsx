'use client';

import { WhatsAppAccountProvider } from '@/components/whatsapp/whatsapp-account-context';

/**
 * WhatsApp module layout — keeps the account provider. The module SubNav is
 * shell chrome — rendered on the gutter by `(app)/layout.tsx` from
 * `@/components/shell/subnav-registry` (WHATSAPP_RAIL).
 */
export default function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WhatsAppAccountProvider>{children}</WhatsAppAccountProvider>;
}
