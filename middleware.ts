import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Every route matched below refreshes the Supabase session cookie (required
// for magic-link auth to keep working across requests) and gates access to
// signed-in-only routes. /admin's additional MFA-recency check is enforced
// in app/admin/layout.tsx (P6), not here — this file only does
// "signed in or not."
// /vote is readable by anyone (voting itself still requires signing in —
// enforced in lib/quest-votes/actions.ts and by RLS, not here), same as the
// /q and /u shareable pages handled below.
const PUBLIC_ROUTES = new Set(["/", "/privacy", "/terms", "/grievance", "/vote"]);

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // API routes do their own auth (session check, or a bearer token for
  // system routes like the cron purge endpoint) and must return JSON on
  // failure, never an HTML redirect — so they're excluded from this gate
  // entirely, not just added to PUBLIC_ROUTES.
  if (path.startsWith("/api/")) {
    return response;
  }

  // /q/[slug] and /u/[handle] are the app's shareable pages — a quest link
  // and a profile link, respectively — and neither app/q/[slug]/page.tsx nor
  // app/u/[handle]/page.tsx requires a signed-in user (the former makes the
  // AddButton/ownRow lookup conditional on `user`; the latter never checks
  // auth at all). Without this, anyone sent a /q/ or /u/ link who isn't
  // already signed in bounced straight back to "/" — the exact "the link
  // doesn't work" failure this app can least afford, since "a page other
  // people can copy from" (the landing page's own pitch) is the point.
  const isPublic =
    PUBLIC_ROUTES.has(path) ||
    path.startsWith("/auth/") ||
    path.startsWith("/_next") ||
    path.startsWith("/q/") ||
    path.startsWith("/u/");

  if (!user && !isPublic) {
    const redirectUrl = new URL("/", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // Signed in but hasn't claimed a handle yet — force onboarding before
  // anything else, except the onboarding route itself and auth callback.
  if (user && !isPublic && path !== "/onboarding/handle") {
    const hasProfile = request.cookies.get("bwa_has_profile")?.value === "1";
    if (!hasProfile) {
      // Cheap cookie-based hint only — the real check (does a profiles row
      // exist) happens server-side in app/onboarding/handle and in every
      // Server Component that reads the profile, via lib/queries. This is
      // just to avoid a redirect loop on every request for a signed-in user
      // who hasn't finished onboarding.
      return NextResponse.redirect(new URL("/onboarding/handle", request.url));
    }
  }

  return response;
}

export const config = {
  // Anything under /public (icons, fonts, robots.txt, etc.) was falling
  // through this matcher and getting treated as a protected route — a
  // signed-out request for /icons/icon.svg got redirected to "/" with
  // ?next=/icons/icon.svg instead of being served, which is why static
  // assets (and any asset-shaped link) looked broken for anyone not
  // logged in. Excluding common public file extensions alongside the
  // existing Next.js internals fixes that.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|woff|woff2)$).*)",
  ],
};
