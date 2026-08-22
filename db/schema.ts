import {
  pgTable,
  pgEnum,
  uuid,
  text,
  smallint,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/*
 * Embedding dimension matches the open-source embedding model served by
 * callModel({task:'embed'}) — nomic-embed-text (768 dims) by default. If you
 * swap embedding models, this dimension and every stored vector must be
 * regenerated together; there is no silent migration path for a dimension
 * change.
 */
const EMBEDDING_DIM = 768;
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return `vector(${EMBEDDING_DIM})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(",")
      .filter(Boolean)
      .map(Number);
  },
});

export const visibilityEnum = pgEnum("visibility", ["private", "anonymous", "public"]);
export const reviewStateEnum = pgEnum("review_state", [
  "draft", // not yet submitted for public visibility
  "pending_auto", // awaiting/failed the deterministic + classifier pass
  "pending_human", // anonymous item awaiting solo-moderator review
  "approved",
  "rejected",
  "held", // 0.4-0.7 classifier band OR report auto-hide — pulled from public view, admin queue
  "flagged", // reported below the auto-hide bar — STILL publicly visible, admin queue for attention only (added in db/migrations/0005_report_abuse_enum.sql)
]);
export const groupSizeEnum = pgEnum("group_size", ["solo", "duo", "group", "any"]);
export const localeEnum = pgEnum("locale", ["campus", "ncr", "anywhere", "any"]);
export const postKindEnum = pgEnum("post_kind", ["blog", "comment"]);
export const boardRoleEnum = pgEnum("board_role", ["owner", "editor", "contributor", "viewer"]);
export const boardMemberStatusEnum = pgEnum("board_member_status", ["invited", "accepted", "declined"]);
export const joinRequestStatusEnum = pgEnum("join_request_status", ["pending", "accepted", "declined"]);
export const reviewDecisionEnum = pgEnum("review_decision", [
  "approved",
  "rejected",
  "converted_named",
]);

// ─── profiles ────────────────────────────────────────────────────────────
// One row per auth.users row. Email is never duplicated here — it lives
// only in auth.users, per the non-negotiable in BUILD-PROMPT.md §8.
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // == auth.users.id
  handle: text("handle").notNull(),
  bio: text("bio"), // opt-in, 140 char max enforced at the Zod boundary + DB check
  bioVisible: boolean("bio_visible").notNull().default(false),
  avatarSeed: text("avatar_seed").notNull(), // deterministic generated-avatar seed, hash of handle
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("profiles_handle_unique").on(t.handle),
  check("profiles_bio_length", sql`${t.bio} is null or char_length(${t.bio}) <= 140`),
]);

// ─── quests (catalog + custom) ───────────────────────────────────────────
export const quests = pgTable("quests", {
  id: text("id").primaryKey(), // e.g. "CP-1001", matches seed-quests.json ids
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(), // one of the 15 seed-quests.json category keys
  difficulty: smallint("difficulty").notNull(), // 1-3
  groupSize: groupSizeEnum("group_size").notNull(),
  locale: localeEnum("locale").notNull(),
  spice: smallint("spice").notNull(), // 1-3
  isCustom: boolean("is_custom").notNull().default(false),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }), // null for seed catalog
  embedding: vector("embedding"), // pgvector, populated by callModel({task:'embed'}) — text only, see §14.1
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("quests_slug_unique").on(t.slug),
  index("quests_category_idx").on(t.category),
  index("quests_embedding_idx").using("hnsw", sql`${t.embedding} vector_cosine_ops`),
]);

// ─── list_items ──────────────────────────────────────────────────────────
// A user's personal instance of a quest (catalog-linked or fully custom).
// Always visible to its owner regardless of review_state — review_state
// only gates whether it appears to anyone else. See §6/§7 for the state
// machine driving pending_human/held/approved/rejected.
export const listItems = pgTable("list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  questId: text("quest_id").references(() => quests.id, { onDelete: "set null" }),
  customTitle: text("custom_title"), // set when not linked to a catalog quest
  category: text("category").notNull(),
  visibility: visibilityEnum("visibility").notNull().default("private"),
  reviewState: reviewStateEnum("review_state").notNull().default("draft"),
  note: text("note"), // PRIVATE ONLY. Never selected in any public serializer — see §8, tested in tests/unit/serializers.test.ts
  proof: text("proof"), // public-facing one-liner, shown when visibility != private and approved
  completedAt: timestamp("completed_at", { withTimezone: true }),
  appealedAt: timestamp("appealed_at", { withTimezone: true }), // §7.1: the one queue-priority mechanism in the product, added in db/migrations/0006_safety_p6.sql
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("list_items_owner_idx").on(t.ownerId),
  index("list_items_visibility_review_idx").on(t.visibility, t.reviewState),
  index("list_items_quest_idx").on(t.questId),
]);

// ─── interests ("I'm in") ────────────────────────────────────────────────
export const interests = pgTable("interests", {
  id: uuid("id").primaryKey().defaultRandom(),
  listItemId: uuid("list_item_id").notNull().references(() => listItems.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("interests_unique_pair").on(t.listItemId, t.userId)]);

// ─── connections (mutual-consent contact reveal) ────────────────────────
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  listItemId: uuid("list_item_id").notNull().references(() => listItems.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  interestedId: uuid("interested_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  ownerAccepted: boolean("owner_accepted").notNull().default(false),
  interestedAccepted: boolean("interested_accepted").notNull().default(false),
  revokedBy: uuid("revoked_by").references(() => profiles.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("connections_unique_pair").on(t.listItemId, t.interestedId)]);

// ─── reactions ("Respect") ───────────────────────────────────────────────
export const reactions = pgTable("reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  listItemId: uuid("list_item_id").notNull().references(() => listItems.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reactions_unique_pair").on(t.listItemId, t.userId)]);

// ─── blocks ──────────────────────────────────────────────────────────────
export const blocks = pgTable("blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockerId: uuid("blocker_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  blockedId: uuid("blocked_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("blocks_unique_pair").on(t.blockerId, t.blockedId)]);

// ─── reports ─────────────────────────────────────────────────────────────
// Never deleted. §7.1: rate-limited at the API layer (5/user/day via
// Upstash), and the 3-report auto-hide threshold is computed in application
// code from distinct-reporter + distinct-reason + account-age rules, not
// a raw count() — this table just stores the facts.
export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  listItemId: uuid("list_item_id").references(() => listItems.id, { onDelete: "cascade" }),
  targetUserId: uuid("target_user_id").references(() => profiles.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reports_reporter_idx").on(t.reporterId),
  index("reports_list_item_idx").on(t.listItemId),
]);

// ─── moderation_log ──────────────────────────────────────────────────────
// Append-only audit trail for every moderation action (auto-hide, restore,
// classifier rejection, admin decision). Never deleted, per §7/§12.
export const moderationLog = pgTable("moderation_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor: text("actor").notNull(), // 'system' | admin profile id as text
  action: text("action").notNull(), // e.g. 'auto_hide', 'restore', 'reject', 'approve'
  targetType: text("target_type").notNull(), // 'list_item' | 'profile' | 'report'
  targetId: text("target_id").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("moderation_log_target_idx").on(t.targetType, t.targetId)]);

// ─── review_assignments ──────────────────────────────────────────────────
// With a solo moderator this is a lightweight tracking table, not a queue
// distribution mechanism — one row per item that entered pending_human or
// held, tracking who picked it up and the outcome, per §6.
export const reviewAssignments = pgTable("review_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  listItemId: uuid("list_item_id").notNull().references(() => listItems.id, { onDelete: "cascade" }),
  assignedTo: uuid("assigned_to").references(() => profiles.id), // the admin, once picked up
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  decision: reviewDecisionEnum("decision"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("review_assignments_list_item_idx").on(t.listItemId),
  index("review_assignments_pending_idx").on(t.resolvedAt),
]);

// ─── identity_reveals ────────────────────────────────────────────────────
// Append-only. No UPDATE/DELETE grant at the DB level for any role — see
// db/migrations/0001_rls.sql. A written reason of at least 20 characters is
// required at the Zod boundary before this row can even be inserted.
export const identityReveals = pgTable("identity_reveals", {
  id: uuid("id").primaryKey().defaultRandom(),
  listItemId: uuid("list_item_id").notNull().references(() => listItems.id, { onDelete: "cascade" }),
  adminId: uuid("admin_id").notNull().references(() => profiles.id),
  reason: text("reason").notNull(),
  revealedOwnerId: uuid("revealed_owner_id").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("identity_reveals_reason_length", sql`char_length(${t.reason}) >= 20`)]);

// ─── events ──────────────────────────────────────────────────────────────
// First-party telemetry only. Schema below is what's published on the
// privacy page per §8/§8.1 — do not add fields here without updating that
// page in the same change.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  eventName: text("event_name").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("events_event_name_idx").on(t.eventName)]);

// ─── policy_acceptances ──────────────────────────────────────────────────
// §8.2: blocking consent at signup, logged server-side, versioned so a
// material policy change can require re-acceptance before the next write.
export const policyAcceptances = pgTable("policy_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  policyVersion: text("policy_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("policy_acceptances_user_version_idx").on(t.userId, t.policyVersion)]);

// ─── account_deletion_requests ───────────────────────────────────────────
// §8: DELETE /account hard-deletes with a 30-day recovery token. The token
// row is deleted immediately on recovery or on expiry (cron), never lingers.
export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  recoveryToken: text("recovery_token").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("account_deletion_token_unique").on(t.recoveryToken)]);

// ═══════════════════════════════════════════════════════════════════════
// P8: per-item blog + links, bulk import, shared boards — see
// BUILD-PROMPT.md §13.1-§13.3. Schema lives here from P1 so it doesn't
// drift from the doc; the UI/API for these tables is P8 work.
// ═══════════════════════════════════════════════════════════════════════

// ─── item_posts (§13.1) ──────────────────────────────────────────────────
// Exactly one of listItemId / boardItemId is set — enforced by the check
// constraint below, not just convention. A list_item post is always
// kind='blog' (your own item has no comment thread). A board_item post can
// be 'blog' or 'comment', gated by the poster's board_members role.
export const itemPosts = pgTable("item_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  listItemId: uuid("list_item_id").references(() => listItems.id, { onDelete: "cascade" }),
  boardItemId: uuid("board_item_id").references(() => boardItems.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  kind: postKindEnum("kind").notNull().default("blog"),
  body: text("body").notNull(),
  links: jsonb("links").$type<{ label: string; url: string }[]>(), // max 5, validated at the Zod boundary, never fetched server-side
  reviewState: reviewStateEnum("review_state").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("item_posts_list_item_idx").on(t.listItemId),
  index("item_posts_board_item_idx").on(t.boardItemId),
  check(
    "item_posts_exactly_one_parent",
    sql`(${t.listItemId} is not null and ${t.boardItemId} is null) or (${t.listItemId} is null and ${t.boardItemId} is not null)`
  ),
]);

// ─── boards (§13.3) ──────────────────────────────────────────────────────
export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  discoverable: boolean("discoverable").notNull().default(false), // "looking for people"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("boards_discoverable_idx").on(t.discoverable)]);

// ─── board_members ───────────────────────────────────────────────────────
export const boardMembers = pgTable("board_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: boardRoleEnum("role").notNull().default("viewer"),
  status: boardMemberStatusEnum("status").notNull().default("invited"),
  invitedBy: uuid("invited_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("board_members_unique_pair").on(t.boardId, t.userId)]);

// ─── board_items ─────────────────────────────────────────────────────────
// A suggestion on the board — wraps a catalog quest or a bespoke title.
// Adding it to your own list creates a normal list_items row (unchanged
// code path); this table never carries completion state, on purpose.
export const boardItems = pgTable("board_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  questId: text("quest_id").references(() => quests.id, { onDelete: "set null" }),
  customTitle: text("custom_title"),
  category: text("category").notNull(),
  addedBy: uuid("added_by").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("board_items_board_idx").on(t.boardId)]);

// ─── board_join_requests ─────────────────────────────────────────────────
// The "looking for people" path — distinct from a direct board_members
// invite. Only meaningful when the target board has discoverable=true.
export const boardJoinRequests = pgTable("board_join_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  message: text("message"),
  status: joinRequestStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("board_join_requests_unique_pair").on(t.boardId, t.userId)]);
