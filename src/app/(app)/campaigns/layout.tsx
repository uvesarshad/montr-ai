/**
 * Email marketing module layout (route is `/campaigns` for historical
 * reasons). The module SubNav is shell chrome — rendered on the gutter by
 * `(app)/layout.tsx` from `@/components/shell/subnav-registry` (EMAIL_RAIL).
 */
export default function EmailMarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
