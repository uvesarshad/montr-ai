/**
 * CRM module layout. The module SubNav is shell chrome now — rendered on the
 * gutter by `(app)/layout.tsx` from `@/components/shell/subnav-registry`
 * (CRM_RAIL), not mounted here.
 */
export default function CrmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
