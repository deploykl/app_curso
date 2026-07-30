import { describe, it, expect } from "vitest";
import { formatPEN, solesToCents } from "@/lib/money";

describe("formatPEN", () => {
  it("formatea céntimos como soles", () => {
    expect(formatPEN(19900)).toBe("S/ 199.00");
    expect(formatPEN(0)).toBe("S/ 0.00");
    expect(formatPEN(5)).toBe("S/ 0.05");
  });

  it("agrupa miles", () => {
    expect(formatPEN(123456)).toBe("S/ 1,234.56");
  });
});

describe("solesToCents", () => {
  it("convierte soles a céntimos enteros", () => {
    expect(solesToCents("199.00")).toBe(19900);
    expect(solesToCents(199)).toBe(19900);
    expect(solesToCents("0.05")).toBe(5);
  });

  it("redondea, no trunca", () => {
    expect(solesToCents("19.999")).toBe(2000);
  });

  it("rechaza valores no numéricos o negativos", () => {
    expect(() => solesToCents("abc")).toThrow();
    expect(() => solesToCents(-1)).toThrow();
  });
});
