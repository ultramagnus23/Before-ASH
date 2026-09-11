import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export type SubmissionRow = {
  id: string;
  title: string;
  category: string;
  reviewState: string;
  scores: Record<string, number> | null;
  createdAt: string;
  submitterHandle: string;
  publishedQuestId: string | null;
};

type Row = {
  id: string;
  title: string;
  category: string;
  review_state: string;
  scores: Record<string, number> | null;
  created_at: string;
  published_quest_id: string | null;
  profiles: { handle: string } | { handle: string }[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (value === null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * The curator's queue: everything still waiting on a decision.
 *
 * Read through the service role, because a submission is readable only by
 * its own submitter under RLS — the curator is not a user with special row
 * access, they are an /admin route behind the MFA gate.
 */
export async function getSubmissionQueue(): Promise<SubmissionRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("id, title, category, review_state, scores, created_at, published_quest_id, profiles!submissions_submitter_id_fkey(handle)")
    .in("review_state", ["pending_auto", "pending_human", "held", "flagged"])
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    reviewState: row.review_state,
    scores: row.scores,
    createdAt: row.created_at,
    publishedQuestId: row.published_quest_id,
    submitterHandle: one(row.profiles)?.handle ?? "someone",
  }));
}

export type MySubmission = {
  id: string;
  title: string;
  reviewState: string;
  createdAt: string;
};

/** Your own submissions. RLS restricts this to them, so no filter is written. */
export async function getMySubmissions(): Promise<MySubmission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("submissions")
    .select("id, title, review_state, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    reviewState: row.review_state as string,
    createdAt: row.created_at as string,
  }));
}

export async function canIPublish(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("publish_invites").select("user_id").maybeSingle();
  return data !== null;
}
