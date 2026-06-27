import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionCookie, getCookieCache } from 'better-auth/cookies';

// Public routes matched as a path PREFIX — the route itself and any sub-path
// (e.g. '/api/auth/' covers '/api/auth/callback/...'). NOTE: never put '/' here
// — `pathname.startsWith('/')` is true for every path, which would make the
// auth redirect, CSRF guard, and admin gate below completely inert.
const publicRoutePrefixes = [
    '/login',
    '/signup',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/auth/signin',  // Keep for backwards compatibility
    '/auth/signup',  // Keep for backwards compatibility
    '/auth/error',
    '/auth/verify-request',
    '/p/',     // Public document viewing
    '/f/',     // Public form viewing/submission (published forms only)
    '/pricing', // Public pricing/marketing page
    '/offline', // PWA offline fallback page
    '/api/auth/',
    '/api/v2/health', // Health check + sub-paths (e.g. /workers) are public
    '/api/health',    // Health check (legacy path)
    '/api/cron/',     // Cron endpoints — each route handler enforces Bearer CRON_SECRET
    '/api/webhooks/', // Inbound webhooks — each route verifies provider signature
    '/api/v2/razorpay/webhook', // Razorpay webhook — handler verifies HMAC signature
    '/api/v2/inbox/webhook/',   // Inbox channel inbound webhook
    '/api/v2/voice/webhooks/',  // Voice provider webhooks (Twilio/etc) — each handler verifies the provider signature fail-closed
    '/api/v2/voice/livekit/webhook', // LiveKit webhook — handler verifies the signed Authorization JWT
    '/api/v2/canvas-webhooks/', // Canvas-triggered webhooks
    '/api/v2/marketing-email/track/', // Open/click tracking pixels
    '/api/public/',   // Public form/document endpoints
    '/api/v2/public/', // Public document API
    '/api/oauth/',    // OAuth callbacks (no session yet)
    '/api/upload',    // Public form file uploads (rate-limited + type-restricted in handler)
    '/test-migration', // Test page is public
];

// Public routes matched EXACTLY (no sub-path). The home page must be matched
// exactly — a prefix match on '/' would match every route.
const publicExactRoutes = new Set<string>([
    '/', // Home page is public
]);

function isPublicRoute(pathname: string): boolean {
    if (publicExactRoutes.has(pathname)) return true;
    return publicRoutePrefixes.some(route => pathname.startsWith(route));
}

// Define admin-only routes
const adminRoutes = [
    '/admin',
    '/organizations',
    '/api/admin',
    '/api/v2/admin',
];

// Mutation methods that should require a same-origin check. GET/HEAD/OPTIONS
// are read-only by HTTP semantics and exempt — the SameSite=Lax cookie default
// already blocks third-party-initiated cross-site form posts, but we layer an
// Origin/Sec-Fetch-Site check on top for defence in depth.
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths intentionally exempt from CSRF — public endpoints already in
// `publicRoutes`, plus webhook receivers that authenticate by signature/secret
// instead of session cookie.
function isCsrfExempt(pathname: string): boolean {
    return isPublicRoute(pathname);
}

function isSameOriginRequest(request: NextRequest): boolean {
    // `Sec-Fetch-Site: same-origin` is the modern signal and is sent by all
    // browsers that support fetch metadata. When present we trust it.
    const secFetchSite = request.headers.get('sec-fetch-site');
    if (secFetchSite) {
        return secFetchSite === 'same-origin' || secFetchSite === 'none';
    }

    // Fall back to Origin comparison. `Origin` is set on every cross-site
    // mutation by modern browsers; missing Origin on a mutation usually means
    // a non-browser caller (script with explicit cookie injection or an
    // ill-formed request) — block it.
    const origin = request.headers.get('origin');
    if (!origin) return false;

    try {
        const originUrl = new URL(origin);
        const requestUrl = request.nextUrl;
        return originUrl.host === requestUrl.host;
    } catch {
        return false;
    }
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public routes
    if (isPublicRoute(pathname)) {
        return NextResponse.next();
    }

    // Allow static files and API routes
    if (
        pathname.startsWith('/_next') ||
        pathname.startsWith('/static') ||
        pathname.startsWith('/favicon.ico')
    ) {
        return NextResponse.next();
    }

    const isApiRoute = pathname.startsWith('/api/');

    // CSRF: same-origin check on mutation requests. BetterAuth sets SameSite=Lax
    // on the session cookie, but a Lax cookie still rides along on top-level POST
    // navigations — this guard blocks that vector too.
    if (
        isApiRoute &&
        CSRF_PROTECTED_METHODS.has(request.method) &&
        !isCsrfExempt(pathname) &&
        !isSameOriginRequest(request)
    ) {
        return NextResponse.json(
            { error: 'Cross-origin request blocked' },
            { status: 403 },
        );
    }

    // Authentication — OPTIMISTIC, Edge-safe presence check only. BetterAuth
    // uses DB-backed sessions that cannot be validated at the Edge (no DB on
    // this runtime), so this only redirects callers with no session cookie at
    // all. Authoritative validation happens in the route handlers / server
    // components via `getSession()` (every protected route already self-checks).
    const sessionCookie = getSessionCookie(request);

    if (!sessionCookie) {
        // APIs get a JSON 401 so client code doesn't try to parse an HTML redirect.
        if (isApiRoute) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Redirect to login if not authenticated
        const url = new URL('/login', request.url);
        url.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(url);
    }

    // Admin routes — OPTIMISTIC role gate from the signed cookie cache (no DB).
    // When the cache is cold/absent we let the request through; the admin route
    // handlers and the admin layout enforce the role authoritatively. This only
    // fast-fails an obviously non-admin caller.
    if (adminRoutes.some(route => pathname.startsWith(route))) {
        let role: string | undefined;
        try {
            const cached = (await getCookieCache(request)) as
                | { user?: { role?: string } }
                | null;
            role = cached?.user?.role;
        } catch {
            role = undefined;
        }
        if (role && role !== 'admin' && role !== 'super_admin') {
            if (isApiRoute) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
