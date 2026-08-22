import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const RECOVERY_WINDOW_DAYS = 30;

// §8: hard-deletes with cascade, but not immediately — a recovery token is
// issued and the actual deletion happens via the purge cron
// (scripts/cron-purge-deleted-accounts.ts) after RECOVERY_WINDOW_DAYS,
// unless the user recovers first via /api/account/recover.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const recoveryToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("account_deletion_requests").insert({
    user_id: user.id,
    recovery_token: recoveryToken,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "Couldn't start deletion. Try again." }, { status: 500 });
  }

  // Signing out immediately — the account is scheduled for deletion, so the
  // session shouldn't keep working even during the recovery window. The
  // recovery link in the confirmation email is the only way back in before
  // the purge runs.
  await supabase.auth.signOut();

  // TODO(P6/P7): email this recovery link — no transactional email provider
  // is wired into the stack yet (Supabase Auth only sends magic links, not
  // arbitrary emails). Until that exists, the recovery link is returned
  // directly in this response so the confirmation screen can show
  // "copy this link now" as the only way to recover the account. This is a
  // real gap for a user who closes the tab without copying it — treat
  // wiring up an email provider (e.g. Resend) as a P6 blocker, not optional
  // polish.
  return NextResponse.json({
    ok: true,
    recoveryUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/account/recover?token=${recoveryToken}`,
    expiresAt: expiresAt.toISOString(),
    message: `Account scheduled for deletion in ${RECOVERY_WINDOW_DAYS} days. Copy the recovery link now — it is not emailed to you yet.`,
  });
}
