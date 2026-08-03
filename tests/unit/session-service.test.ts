import { describe, it, expect } from "vitest";
import { classSessionInputSchema, limaLocalToUtc, isValidZoomUrl } from "@/modules/catalog/service";

describe("limaLocalToUtc", () => {
  it("interpreta la hora como Lima y devuelve UTC", () => {
    expect(limaLocalToUtc("2026-08-15T10:00").toISOString()).toBe("2026-08-15T15:00:00.000Z");
  });

  it("no depende de la zona horaria del servidor", () => {
    const a = limaLocalToUtc("2026-01-15T08:30").toISOString();
    expect(a).toBe("2026-01-15T13:30:00.000Z");
  });
});

describe("isValidZoomUrl", () => {
  it("acepta enlaces de Zoom", () => {
    expect(isValidZoomUrl("https://zoom.us/j/1234567890")).toBe(true);
    expect(isValidZoomUrl("https://us05web.zoom.us/j/1234?pwd=abc")).toBe(true);
  });

  it("acepta Meet y Teams", () => {
    expect(isValidZoomUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isValidZoomUrl("https://teams.microsoft.com/l/meetup-join/x")).toBe(true);
  });

  it("rechaza http sin cifrar", () => {
    expect(isValidZoomUrl("http://zoom.us/j/123")).toBe(false);
  });

  it("rechaza dominios arbitrarios", () => {
    expect(isValidZoomUrl("https://evil.com/j/123")).toBe(false);
  });

  it("rechaza basura", () => {
    expect(isValidZoomUrl("no soy una url")).toBe(false);
  });
});

describe("classSessionInputSchema", () => {
  const ok = {
    deliveryMode: "en_vivo" as const, startsAtLocal: "2026-08-15T10:00",
    durationMinutes: 90, isFreePreview: false,
  };

  it("acepta una sesión válida", () => {
    expect(classSessionInputSchema.safeParse(ok).success).toBe(true);
  });

  it("acepta sesión sin link de Zoom (se pega después)", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, zoomUrl: "" }).success).toBe(true);
  });

  it("rechaza un link que no sea de videollamada", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, zoomUrl: "https://evil.com/x" }).success).toBe(false);
  });

  it("rechaza duración cero o negativa", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, durationMinutes: 0 }).success).toBe(false);
  });

  it("rechaza duración mayor a 8 horas", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, durationMinutes: 481 }).success).toBe(false);
  });
});
