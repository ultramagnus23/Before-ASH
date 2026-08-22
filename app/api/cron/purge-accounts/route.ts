import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Vercel Cron calls this on schedule (see vercel.json). Guarded by
// CRON_SECRET so it can't be triggered by anyone who finds the URL — Vercel
// Cron sends this header automatically when CRON_SECRET is set as an env var.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: expired, error } = await supabase
    .from("account_deletion_requests")
    .select("id, user_id, expires_at")
    .lt("expires_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let deleted = 0;
  for (const row of expired ?? []) {
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(row.user_id);
    if (deleteErr) continue;
    await supabase.from("account_deletion_requests").delete().eq("id", row.id);
    deleted++;
  }

  return NextResponse.json({ ok: true, deleted, checked: expired?.length ?? 0 });
}
