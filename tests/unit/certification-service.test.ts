import { describe, it, expect } from "vitest";
import { generarCodigo } from "@/modules/certification/service";

describe("generarCodigo", () => {
  it("tiene el formato XXXX-XXXX", () => {
    const code = generarCodigo();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("nunca usa caracteres ambiguos (0 O 1 I L)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generarCodigo();
      expect(code).not.toMatch(/[0O1IL]/);
    }
  });

  it("genera valores distintos en llamadas sucesivas", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generarCodigo()));
    // 50 códigos de un alfabeto de 31^8 combinaciones: la probabilidad de
    // colisión es despreciable, así que todos deben ser distintos.
    expect(codes.size).toBe(50);
  });
});
