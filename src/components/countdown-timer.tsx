"use client";
import { useEffect, useState } from "react";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function splitRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative overflow-hidden rounded-md bg-foreground/5 px-1.5 py-0.5">
        <span key={value} className="animate-count-pop block text-sm font-bold tabular-nums">
          {pad(value)}
        </span>
      </div>
      <span className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

export function CountdownTimer({
  startsAt,
  onArrive,
}: {
  startsAt: Date | string;
  onArrive?: () => void;
}) {
  const target = new Date(startsAt).getTime();
  const [remainingMs, setRemainingMs] = useState(() => target - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const next = target - Date.now();
      setRemainingMs(next);
      if (next <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  useEffect(() => {
    if (remainingMs <= 0) onArrive?.();
  }, [remainingMs, onArrive]);

  if (remainingMs <= 0) return null;

  const { hours, minutes, seconds } = splitRemaining(remainingMs);

  return (
    <div className="flex items-center gap-1">
      <Unit value={hours} label="hr" />
      <span className="pb-2.5 text-sm font-bold text-muted-foreground">:</span>
      <Unit value={minutes} label="min" />
      <span className="pb-2.5 text-sm font-bold text-muted-foreground">:</span>
      <Unit value={seconds} label="seg" />
    </div>
  );
}
