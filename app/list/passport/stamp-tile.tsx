import { inkForCategory, seedRotationDeg, stampCode, formatStampDate } from "@/lib/stamps";

const CATEGORY_LABEL: Record<string, string> = {
  campus_ritual: "Campus ritual",
  academic: "Academic",
  food: "Food",
  people: "People",
  creative: "Make",
  body_sport: "Body",
  delhi_ncr: "Off campus",
  career_money: "Career",
  service: "Give",
  solitude: "Alone",
  night: "After midnight",
  legacy: "Before you leave",
  chaos: "Chaotic good",
  skills: "Learn",
  admin_life: "Unglamorous",
};

// A read-only rendering of the stamp mark, always in its "done" state — the
// passport-object view (Phase 3 item 2) is a gallery of marks already
// earned, not an interactive control, so this deliberately doesn't reuse
// app/list/row.tsx's stamp-mark button (which is a hold-to-confirm control
// with its own pending/optimistic state machine that has no meaning here).
export function StampTile({
  id,
  category,
  questId,
  title,
  completedAt,
}: {
  id: string;
  category: string;
  questId: string | null;
  title: string;
  completedAt: string;
}) {
  const ink = inkForCategory(category);
  // Tighter range than the live stamp's own -11..8deg — a whole page of
  // marks at that scatter reads as messy rather than hand-stamped once
  // there are more than a handful on screen at once.
  const rotation = (seedRotationDeg(id) % 8) - 1;
  const code = stampCode({ questId, listItemId: id });

  return (
    <li
      className={`ink-${ink} border border-rule px-2.5 pt-2.5 pb-2 flex flex-col gap-1.5`}
      style={{ transform: `rotate(${rotation}deg)` }}
      title={title}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="flex-none">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
      <span className="font-display font-extrabold text-s-minus-2 tracking-[0.1em] uppercase leading-tight">
        {CATEGORY_LABEL[category] ?? category}
      </span>
      <span className="font-mono text-s-minus-2 text-ink-faint tracking-wide">
        {formatStampDate(completedAt)} · {code}
      </span>
      <span className="font-body text-s-minus-1 text-ink-mid leading-snug line-clamp-2">{title}</span>
    </li>
  );
}
