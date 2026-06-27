/**
 * Social module layout. The module SubNav is shell chrome — rendered on the
 * gutter by `(app)/layout.tsx` from `@/components/shell/subnav-registry`
 * (SOCIAL_RAIL; `/social/oauth-callback` renders bare via the registry's
 * `exclude` list).
 */
export default function SocialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
