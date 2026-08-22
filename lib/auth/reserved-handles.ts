// Handles that would be confusing, impersonation-risk, or collide with app
// routes if claimable by a student. Checked case-insensitively at claim time
// in addition to the DB unique index on profiles.handle.
export const RESERVED_HANDLES = new Set([
  // route collisions — app/[handle-shaped routes] would break
  "admin",
  "api",
  "auth",
  "list",
  "explore",
  "feed",
  "board",
  "boards",
  "onboarding",
  "settings",
  "privacy",
  "terms",
  "grievance",
  "u",
  "q",
  "login",
  "logout",
  "signup",
  "static",
  "assets",
  "_next",
  // brand / impersonation risk
  "beforeash",
  "before_ash",
  "ashoka",
  "ashokauniversity",
  "support",
  "help",
  "moderator",
  "mod",
  "official",
  "team",
  "staff",
  "root",
  "system",
  "anonymous",
]);

export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}
