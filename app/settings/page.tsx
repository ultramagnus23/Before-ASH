import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BioForm } from "./bio-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("handle, bio, bio_visible")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <main className="min-h-screen max-w-[64ch] mx-auto px-4 py-16 text-ink bg-page">
      <p className="font-mono text-s-minus-1 text-ink-faint uppercase tracking-wide mb-2">Settings</p>
      <h1 className="font-display font-extrabold text-s-3 mb-8">@{profile?.handle}</h1>
      <BioForm initialBio={profile?.bio ?? ""} initialVisible={profile?.bio_visible ?? false} />
    </main>
  );
}
