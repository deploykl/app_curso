import { describe, it, expect } from "vitest";
import { computeProgress, pickNextSession, daysUntilLabel, attendanceButtonLabel } from "@/modules/learning/service";

describe("computeProgress", () => {
  it("calcula el porcentaje redondeado", () => {
    expect(computeProgress(4, 2)).toBe(50);
    expect(computeProgress(3, 1)).toBe(33);
  });

  it("devuelve 0 si no hay sesiones", () => {
    expect(computeProgress(0, 0)).toBe(0);
  });
});

describe("pickNextSession", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("elige la sesión futura más próxima", () => {
    const sessions = [
      { id: "a", startsAt: new Date("2026-08-10T12:00:00Z"), durationMinutes: 60 },
      { id: "b", startsAt: new Date("2026-08-05T12:00:00Z"), durationMinutes: 60 },
      { id: "c", startsAt: new Date("2026-07-20T12:00:00Z"), durationMinutes: 60 },
    ];
    expect(pickNextSession(sessions, now)?.id).toBe("b");
  });

  it("si todas ya pasaron, elige la más reciente", () => {
    const sessions = [
      { id: "a", startsAt: new Date("2026-07-01T12:00:00Z"), durationMinutes: 60 },
      { id: "b", startsAt: new Date("2026-07-20T12:00:00Z"), durationMinutes: 60 },
    ];
    expect(pickNextSession(sessions, now)?.id).toBe("b");
  });

  it("devuelve null si no hay sesiones", () => {
    expect(pickNextSession([], now)).toBeNull();
  });
});

describe("daysUntilLabel", () => {
  const now = new Date("2026-08-01T12:00:00Z");

  it("dice Hoy si ya empezó o es en menos de un día", () => {
    expect(daysUntilLabel(new Date("2026-08-01T18:00:00Z"), now)).toBe("Hoy");
  });

  it("dice Mañana para el día siguiente", () => {
    expect(daysUntilLabel(new Date("2026-08-02T12:00:00Z"), now)).toBe("Mañana");
  });

  it("dice Faltan N días para más adelante", () => {
    expect(daysUntilLabel(new Date("2026-08-05T12:00:00Z"), now)).toBe("Faltan 4 días");
  });
});

describe("attendanceButtonLabel", () => {
  it("dice 'Marcar como asistido' si la sesión no ha pasado", () => {
    expect(attendanceButtonLabel("upcoming")).toBe("Marcar como asistido");
    expect(attendanceButtonLabel("live")).toBe("Marcar como asistido");
  });

  it("dice 'Marcar como visto' si ya pasó", () => {
    expect(attendanceButtonLabel("past")).toBe("Marcar como visto");
  });
});
