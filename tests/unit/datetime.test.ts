import { describe, it, expect } from "vitest";
import { formatLima, sessionState } from "@/lib/datetime";

describe("formatLima", () => {
  it("muestra la hora en zona de Lima, no en UTC", () => {
    // 2026-08-15T00:00:00Z son las 19:00 del 14/08 en Lima (UTC-5)
    const out = formatLima(new Date("2026-08-15T00:00:00Z"));
    expect(out).toContain("14");
    expect(out).toContain("7:00");
  });
});

describe("sessionState", () => {
  const startsAt = new Date("2026-08-15T15:00:00Z");

  it("es 'upcoming' antes de empezar", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T14:59:00Z"))).toBe("upcoming");
  });

  it("es 'live' durante la sesión", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T15:30:00Z"))).toBe("live");
  });

  it("sigue 'live' en el minuto final", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T15:59:59Z"))).toBe("live");
  });

  it("es 'past' al terminar la duración", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T16:00:01Z"))).toBe("past");
  });

  it("da 15 minutos de gracia antes del inicio", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T14:50:00Z"))).toBe("live");
  });
});
