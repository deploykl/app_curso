import { describe, it, expect } from "vitest";
import { computeOrderTotals, isCouponValid, computeCommission } from "@/modules/billing/service";

describe("computeOrderTotals", () => {
  it("sin cupón, el total es el precio del curso", () => {
    expect(computeOrderTotals(19900, null)).toEqual({
      subtotalCents: 19900, discountCents: 0, totalCents: 19900,
    });
  });

  it("cupón porcentual", () => {
    expect(computeOrderTotals(20000, { type: "percent", value: 20 })).toEqual({
      subtotalCents: 20000, discountCents: 4000, totalCents: 16000,
    });
  });

  it("cupón fijo nunca deja el total negativo", () => {
    expect(computeOrderTotals(5000, { type: "fixed", value: 9900 })).toEqual({
      subtotalCents: 5000, discountCents: 5000, totalCents: 0,
    });
  });

  it("redondea el porcentaje a céntimos enteros", () => {
    expect(computeOrderTotals(9999, { type: "percent", value: 33 })).toEqual({
      subtotalCents: 9999, discountCents: 3300, totalCents: 6699,
    });
  });
});

describe("isCouponValid", () => {
  const base = {
    isActive: true, courseId: null as string | null,
    validFrom: null as Date | null, validUntil: null as Date | null,
    maxUses: null as number | null, usedCount: 0,
  };
  const now = new Date("2026-08-01T00:00:00Z");

  it("acepta un cupón sin restricciones", () => {
    expect(isCouponValid(base, "curso-1", now)).toEqual({ ok: true });
  });

  it("rechaza un cupón inactivo", () => {
    const r = isCouponValid({ ...base, isActive: false }, "curso-1", now);
    expect(r.ok).toBe(false);
  });

  it("rechaza fuera de la ventana de vigencia", () => {
    const r = isCouponValid(
      { ...base, validUntil: new Date("2026-07-01T00:00:00Z") }, "curso-1", now
    );
    expect(r.ok).toBe(false);
  });

  it("rechaza si ya alcanzó el máximo de usos", () => {
    const r = isCouponValid({ ...base, maxUses: 5, usedCount: 5 }, "curso-1", now);
    expect(r.ok).toBe(false);
  });

  it("rechaza si el cupón es de otro curso", () => {
    const r = isCouponValid({ ...base, courseId: "curso-2" }, "curso-1", now);
    expect(r.ok).toBe(false);
  });

  it("acepta si el cupón es del mismo curso", () => {
    expect(isCouponValid({ ...base, courseId: "curso-1" }, "curso-1", now)).toEqual({ ok: true });
  });
});

describe("computeCommission", () => {
  it("calcula comisión y neto redondeando a céntimos", () => {
    expect(computeCommission(19900, "30.00")).toEqual({ commissionCents: 5970, netCents: 13930 });
  });

  it("una comisión de 0 deja el neto igual al bruto", () => {
    expect(computeCommission(10000, "0.00")).toEqual({ commissionCents: 0, netCents: 10000 });
  });

  it("redondea correctamente montos que no dan entero exacto", () => {
    // 9999 * 33% = 3299.67 -> redondeado 3300
    expect(computeCommission(9999, "33.00")).toEqual({ commissionCents: 3300, netCents: 6699 });
  });
});
