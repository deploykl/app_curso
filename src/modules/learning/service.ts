import type { SessionState } from "@/lib/datetime";

export function computeProgress(total: number, attended: number): number {
  if (total <= 0) return 0;
  return Math.round((attended / total) * 100);
}

export interface AgendaSessionRef {
  id: string;
  startsAt: Date;
  durationMinutes: number;
}

/** La sesión futura (o en vivo) más próxima; si todas pasaron, la más reciente. Null si no hay ninguna. */
export function pickNextSession<T extends AgendaSessionRef>(
  sessions: T[],
  now: Date = new Date()
): T | null {
  if (sessions.length === 0) return null;

  const notPast = sessions
    .filter((s) => {
      const endsAt = s.startsAt.getTime() + s.durationMinutes * 60_000;
      return now.getTime() <= endsAt;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  if (notPast.length > 0) return notPast[0];

  return sessions.slice().sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
}

export function daysUntilLabel(startsAt: Date, now: Date = new Date()): string {
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(startsAt.getFullYear(), startsAt.getMonth(), startsAt.getDate());

  const diffMs = startDate.getTime() - nowDate.getTime();
  const days = Math.round(diffMs / 86_400_000);

  if (days <= 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `Faltan ${days} días`;
}

export function attendanceButtonLabel(state: SessionState): string {
  return state === "past" ? "Marcar como visto" : "Marcar como asistido";
}
