"use client";

import { useRef, useState } from "react";

const CARD_WIDTH = 384; // w-96
const GAP = 6;

/** Shows `details` in a floating card while the pointer is over (or keyboard
 * focus is on) the trigger. Positioned `fixed` from the trigger's rect rather
 * than absolutely inside the cell: the tables this sits in scroll sideways
 * (overflow-x-auto), which would clip an absolutely positioned card at the
 * table's edge — most visibly on the last rows. */
export function HoverDetails({
  children,
  details,
  className,
}: {
  children: React.ReactNode;
  details: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  function show() {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - CARD_WIDTH - 8));
    // Open upward when the trigger is in the lower part of the screen, so the
    // card doesn't run off the bottom.
    setPos(r.bottom > window.innerHeight * 0.6 ? { left, bottom: window.innerHeight - r.top + GAP } : { left, top: r.bottom + GAP });
  }

  return (
    <div
      ref={ref}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
      onFocus={show}
      onBlur={() => setPos(null)}
      className={`cursor-help outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className ?? ""}`}
    >
      {children}
      {pos && (
        <div
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: CARD_WIDTH }}
          className="pointer-events-none z-50 max-w-[calc(100vw-16px)] whitespace-normal rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {details}
        </div>
      )}
    </div>
  );
}
