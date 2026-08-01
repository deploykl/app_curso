import { LIMA, type SessionState } from "@/lib/datetime";

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

const limaDayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: LIMA, year: "numeric", month: "2-digit", day: "2-digit",
});

/** Medianoche UTC del día calendario que `date` representa en la zona America/Lima. */
function limaCalendarDayUtcMidnight(date: Date): number {
  const parts = Object.fromEntries(limaDayFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export function daysUntilLabel(startsAt: Date, now: Date = new Date()): string {
  const nowDay = limaCalendarDayUtcMidnight(now);
  const startDay = limaCalendarDayUtcMidnight(startsAt);

  const diffMs = startDay - nowDay;
  const days = Math.round(diffMs / 86_400_000);

  if (days <= 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `Faltan ${days} días`;
}

export function attendanceButtonLabel(state: SessionState): string {
  return state === "past" ? "Marcar como visto" : "Marcar como asistido";
}
