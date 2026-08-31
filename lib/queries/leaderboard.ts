import "server-only";
import { createClient } from "@/lib/supabase/server";

export type LeaderboardQuest = {
  id: string;
  slug: string;
  title: string;
  category: string;
  difficulty: number;
  spice: number;
  voteCount: number;
  addCount: number;
  hasVoted: boolean;
  alreadyAdded: boolean;
};

export type Leaderboard = {
  quests: LeaderboardQuest[];
  totalVotes: number;
  signedIn: boolean;
};

const BOARD_SIZE = 40;

// Ranked by votes, with "how many people put it on their list" shown
// alongside rather than folded into one blended score — they answer two
// different questions ("is this a great idea" vs "did anyone actually
// commit"), and collapsing them into a single number would hide the most
// interesting case: the quest everyone admires and nobody has done.
export async function getLeaderboard(): Promise<Leaderboard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: quests }, { data: voteRows }, { data: addRows }, myVotes, myItems] = await Promise.all([
    supabase.from("quests").select("id, slug, title, category, difficulty, spice"),
    supabase.rpc("quest_vote_counts"),
    supabase.rpc("quest_add_counts"),
    user
      ? supabase
          .from("quest_votes")
          .select("quest_id")
          .eq("user_id", user.id)
          .then(({ data }) => new Set((data ?? []).map((r) => r.quest_id as string)))
      : Promise.resolve(new Set<string>()),
    user
      ? supabase
          .from("list_items")
          .select("quest_id")
          .eq("owner_id", user.id)
          .not("quest_id", "is", null)
          .then(({ data }) => new Set((data ?? []).map((r) => r.quest_id as string)))
      : Promise.resolve(new Set<string>()),
  ]);

  const votes = new Map<string, number>(
    ((voteRows ?? []) as { quest_id: string; vote_count: number }[]).map((r) => [r.quest_id, Number(r.vote_count)])
  );
  const adds = new Map<string, number>(
    ((addRows ?? []) as { quest_id: string; add_count: number }[]).map((r) => [r.quest_id, Number(r.add_count)])
  );

  const ranked = ((quests ?? []) as Omit<LeaderboardQuest, "voteCount" | "addCount" | "hasVoted" | "alreadyAdded">[])
    .map((q) => ({
      ...q,
      voteCount: votes.get(q.id) ?? 0,
      addCount: adds.get(q.id) ?? 0,
      hasVoted: myVotes.has(q.id),
      alreadyAdded: myItems.has(q.id),
    }))
    // Votes first, then real commitment as the tiebreaker, then a stable
    // id sort so an all-zero board isn't a different arbitrary order on
    // every request.
    .sort((a, b) => b.voteCount - a.voteCount || b.addCount - a.addCount || a.id.localeCompare(b.id));

  return {
    quests: ranked.slice(0, BOARD_SIZE),
    totalVotes: [...votes.values()].reduce((sum, n) => sum + n, 0),
    signedIn: Boolean(user),
  };
}
