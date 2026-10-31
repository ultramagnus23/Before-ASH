/*
 * Server-side error capture. Next calls onRequestError for every uncaught
 * error in a route, server component or server action. We record it in the
 * first-party `events` table (event name "server_error") so it shows on the
 * oversight Overview page: no third-party error service ever receives
 * anything, consistent with the privacy page. Stored: route path (no query
 * string), error name, Next's digest, a truncated message. No user id.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string }
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { logEvent } = await import("@/lib/events/log");
    const e = err as { name?: string; message?: string; digest?: string };
    await logEvent(null, "server_error", {
      path: request.path.split("?")[0],
      route: context.routePath,
      type: context.routeType,
      method: request.method,
      name: e?.name ?? "Error",
      digest: e?.digest ?? null,
      message: String(e?.message ?? "").slice(0, 200),
    });
  } catch {
    // Monitoring must never take a request down with it.
  }
}
