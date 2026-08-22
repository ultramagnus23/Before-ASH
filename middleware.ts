import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Every route matched below refreshes the Supabase session cookie (required
// for magic-link auth to keep working across requests) and gates access to
// signed-in-only routes. /admin's additional MFA-recency check is enforced
// in app/admin/layout.tsx (P6), not here — this file only does
// "signed in or not."
const PUBLIC_ROUTES = new Set(["/", "/privacy", "/terms", "/grievance"]);

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

  const isPublic = PUBLIC_ROUTES.has(path) || path.startsWith("/auth/") || path.startsWith("/_next");

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
