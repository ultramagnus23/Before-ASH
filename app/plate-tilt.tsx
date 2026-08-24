"use client";

import { useRef } from "react";

const MAX_TILT_DEG = 1.4;

/*
 * The sheet responding to a pointer — one of Phase 3's motion rules
 * (app/globals.css's .plate-tilt). A plain, restrained parallax: the
 * article tilts a fraction of a degree toward wherever the pointer is,
 * and eases back to flat on pointer leave. Client component only because
 * it needs pointermove; everything it wraps stays server-rendered — this
 * file adds one event listener, not a client-side re-render of the page.
 */
export function PlateTilt({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return; // touch/pen shouldn't fight scrolling with a tilt
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--tilt-x", `${(py * -1 * MAX_TILT_DEG).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(px * MAX_TILT_DEG).toFixed(2)}deg`);
  }

  function handlePointerLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <article
      ref={ref}
      className={`plate-tilt ${className}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {children}
    </article>
  );
}
