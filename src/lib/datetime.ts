export const LIMA = "America/Lima";

export function formatLima(
  date: Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }
): string {
  return new Intl.DateTimeFormat("es-PE", { ...opts, timeZone: LIMA }).format(date);
}

export type SessionState = "upcoming" | "live" | "past";

export function sessionState(
  startsAt: Date,
  durationMinutes: number,
  now: Date = new Date()
): SessionState {
  const joinOpensAt = startsAt.getTime() - 10 * 60_000;
  const joinClosesAt = startsAt.getTime() - 1 * 60_000;
  const sessionEndsAt = startsAt.getTime() + durationMinutes * 60_000;
  const nowTime = now.getTime();

  if (nowTime < joinOpensAt) return "upcoming";
  if (nowTime < joinClosesAt) return "live";
  if (nowTime < startsAt.getTime()) return "upcoming";
  if (nowTime <= sessionEndsAt) return "live";
  return "past";
}
