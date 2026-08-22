// The real `server-only` package throws unconditionally when imported
// outside Next.js's RSC bundler pass (it only no-ops under the special
// "react-server" module condition that Next.js's webpack/turbopack config
// sets up) — Vitest runs in plain Node, so any module under test that has
// `import "server-only"` at the top would otherwise fail to load at all.
// vitest.config.ts aliases "server-only" to this empty module so those
// files stay importable in tests, while production builds still get the
// real guard against a server-only module leaking into a client bundle.
export {};
