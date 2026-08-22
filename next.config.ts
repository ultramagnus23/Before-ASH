import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Fails the build if a server-only secret is ever referenced with the
// NEXT_PUBLIC_ prefix, or bundled into client code by accident.
const FORBIDDEN_CLIENT_ENV = ["SUPABASE_SERVICE_ROLE_KEY", "LLM_API_URL", "UPSTASH_REDIS_REST_TOKEN"];

for (const key of FORBIDDEN_CLIENT_ENV) {
  if (process.env[`NEXT_PUBLIC_${key}`]) {
    throw new Error(
      `Build failure: ${key} must never be exposed as NEXT_PUBLIC_${key}. This is a server-only secret.`
    );
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Moved out of `experimental` in a Next.js minor release after this was
  // first written against 15.1.0 — caught by the deprecation warning the
  // first time `next dev` actually ran under the bumped 15.5.23.
  typedRoutes: true,
  // An unrelated package-lock.json in the user's home directory (from some
  // other, unrelated project) made Next.js infer the wrong workspace root
  // and warn about it on every dev-server start — pinning this explicitly
  // is Next's own recommended fix, found the first time `next dev` was
  // actually run for this project.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
};

export default nextConfig;
