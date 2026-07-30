import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("quita tildes y ñ", () => {
    expect(slugify("Diseño Gráfico Básico")).toBe("diseno-grafico-basico");
  });

  it("colapsa separadores", () => {
    expect(slugify("  Excel   ---  Avanzado!! ")).toBe("excel-avanzado");
  });

  it("nunca devuelve cadena vacía", () => {
    expect(slugify("¡¿!").length).toBeGreaterThan(0);
  });
});

describe("uniqueSlug", () => {
  it("devuelve el base si está libre", async () => {
    expect(await uniqueSlug("excel", async () => false)).toBe("excel");
  });

  it("añade sufijo numérico si está tomado", async () => {
    const tomados = new Set(["excel", "excel-2"]);
    expect(await uniqueSlug("excel", async (s) => tomados.has(s))).toBe("excel-3");
  });
});
