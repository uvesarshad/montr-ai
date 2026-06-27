/**
 * Omnichannel Inbox module layout. The module SubNav is shell chrome —
 * rendered on the gutter by `(app)/layout.tsx` from
 * `@/components/shell/subnav-registry` (INBOX_RAIL; `/inbox/chatbots`
 * renders bare via the registry's `exclude` list).
 */
export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
