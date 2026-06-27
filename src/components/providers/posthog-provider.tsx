'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useSession } from '@/lib/auth-client';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

/** True only in the browser with a configured key. */
function isEnabled(): boolean {
  return typeof window !== 'undefined' && !!POSTHOG_KEY;
}

/**
 * Manual pageview capture. App Router does not fire SPA navigations as full
 * page loads, so we capture `$pageview` on path/search changes ourselves
 * (init uses `capture_pageview: false`).
 *
 * `useSearchParams()` requires a Suspense boundary in App Router — this
 * component is mounted inside <Suspense> below.
 */
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isEnabled()) return;
    let url = window.origin + pathname;
    const search = searchParams?.toString();
    if (search) url += `?${search}`;
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Identify / group / reset based on the BetterAuth session.
 * - identified_only profiles: we only identify once a user id exists.
 * - No email captured (keep PII lean) — role + org grouping only.
 */
function PostHogIdentify() {
  const { data: session } = useSession();
  const user = session?.user;
  /** Track whether we were authenticated so we only reset on real logout. */
  const wasAuthed = useRef(false);

  useEffect(() => {
    if (!isEnabled()) return;

    if (user?.id) {
      posthog.identify(user.id, { role: (user as { role?: string }).role });
      wasAuthed.current = true;
    } else if (wasAuthed.current) {
      // Transition from authenticated -> unauthenticated: clear identity.
      posthog.reset();
      wasAuthed.current = false;
    }
  }, [user]);

  return null;
}

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isEnabled() || posthog.__loaded) return;
    posthog.init(POSTHOG_KEY as string, {
      api_host: POSTHOG_HOST,
      person_profiles: 'identified_only',
      capture_pageview: false, // manual — see PostHogPageview
      autocapture: true,
      disable_session_recording: true,
    });
  }, []);

  // No-op cleanly when unconfigured: render children with no tracking children.
  if (!POSTHOG_KEY) return <>{children}</>;

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      <PostHogIdentify />
      {children}
    </>
  );
}
