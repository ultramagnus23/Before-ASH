import { createClient } from "@supabase/supabase-js";

/*
 * Standalone copy of lib/supabase/server.ts's createServiceRoleClient(),
 * not an import of it: that file has `import "server-only"`, which throws
 * unconditionally outside Next.js's bundler (found live, running these
 * scripts directly via `tsx`). lib/supabase/server.ts is imported by 30+
 * app files, so it can't drop that guard — duplicating this one small
 * client constructor for scripts is the safer tradeoff, same reasoning as
 * scripts/seed.ts's embedForSeed().
 */
export function createServiceRoleClient() {
  return createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
