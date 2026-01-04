"use client";

import { msToClock } from "../lib/utils";

export default function TimerPill(props: {
  remainingMs: number;
  paused: boolean;
  label: string;
  showClock?: boolean;
}) {
  const { remainingMs, paused, label, showClock = true } = props;

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-white backdrop-blur">
      <span className="text-sm opacity-80">{label}</span>
      {showClock ? (
        <span className="inline-flex items-center font-semibold rounded-full bg-white/15 px-3 py-1 font-mono text-lg">
          {msToClock(remainingMs)}
        </span>
      ) : null}
      {paused ? (
        <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-xs text-yellow-200">Pausado</span>
      ) : null}
    </div>
  );
}
