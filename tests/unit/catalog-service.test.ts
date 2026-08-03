import { describe, it, expect } from "vitest";
import { courseInputSchema, resolveCommissionRate, canPublish } from "@/modules/catalog/service";

describe("courseInputSchema", () => {
  it("acepta una entrada válida", () => {
    const r = courseInputSchema.safeParse({
      title: "Excel desde cero", level: "basico", priceSoles: "199.00",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza título vacío", () => {
    expect(courseInputSchema.safeParse({ title: "", level: "basico", priceSoles: "1" }).success).toBe(false);
  });

  it("rechaza precio negativo", () => {
    expect(courseInputSchema.safeParse({ title: "X", level: "basico", priceSoles: "-5" }).success).toBe(false);
  });

  it("acepta precio cero (curso gratuito)", () => {
    expect(courseInputSchema.safeParse({ title: "Curso gratis", level: "basico", priceSoles: "0" }).success).toBe(true);
  });

  it("rechaza un nivel inventado", () => {
    expect(courseInputSchema.safeParse({ title: "X", level: "experto", priceSoles: "1" }).success).toBe(false);
  });
});

describe("resolveCommissionRate", () => {
  it("el override del curso gana sobre el perfil", () => {
    expect(resolveCommissionRate("15.00", "30.00")).toBe("15.00");
  });

  it("usa el del perfil si no hay override", () => {
    expect(resolveCommissionRate(null, "30.00")).toBe("30.00");
  });

  it("un override de 0 es válido y gana", () => {
    expect(resolveCommissionRate("0.00", "30.00")).toBe("0.00");
  });
});

describe("canPublish", () => {
  it("permite publicar un curso con sesiones", () => {
    expect(canPublish({ sessionCount: 2 })).toEqual({ ok: true });
  });

  it("bloquea si no hay sesiones", () => {
    const r = canPublish({ sessionCount: 0 });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/sesión/i);
  });
});
