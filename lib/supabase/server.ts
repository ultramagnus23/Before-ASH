import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Request-scoped client bound to the signed-in user's session. All RLS
// policies apply to queries made through this client — this is how
// lib/queries/* enforces visibility rules without re-deriving them at
// every call site.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component with no response to write to —
            // safe to ignore as long as middleware refreshes the session.
          }
        },
      },
    }
  );
}

// Service-role client that BYPASSES RLS entirely. Only ever imported by
// code under app/**/route.ts or app/**/actions.ts that has already done
// its own authorization check (e.g. the ADMIN_HANDLES + MFA gate for
// /admin, or the seed loader script). Never imported by a Server Component
// that renders user-supplied data directly from it.
export function createServiceRoleClient() {
  return createSupabaseClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
