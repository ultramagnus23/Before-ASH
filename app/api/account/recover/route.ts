import { createServiceRoleClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

// Recovering just means deleting the pending account_deletion_requests row
// before the purge cron gets to it — the account itself was never touched
// during the recovery window, only marked for deletion.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { data: pending, error } = await supabase
    .from("account_deletion_requests")
    .select("id, expires_at")
    .eq("recovery_token", token)
    .maybeSingle();

  if (error || !pending) {
    return NextResponse.json({ error: "Invalid or already-used recovery link." }, { status: 404 });
  }

  if (new Date(pending.expires_at) < new Date()) {
    return NextResponse.json({ error: "This recovery link has expired. The account has been deleted." }, { status: 410 });
  }

  await supabase.from("account_deletion_requests").delete().eq("id", pending.id);

  return NextResponse.json({ ok: true, message: "Deletion cancelled. Sign in again to continue." });
}
