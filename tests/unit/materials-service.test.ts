import { describe, it, expect } from "vitest";
import { validateUpload, materialKey, MAX_FILE_BYTES } from "@/modules/materials/service";

describe("validateUpload", () => {
  const ok = { fileName: "guia.pdf", mimeType: "application/pdf", sizeBytes: 1_000_000 };

  it("acepta un PDF normal", () => {
    expect(validateUpload(ok).ok).toBe(true);
  });

  it("rechaza un tipo no permitido", () => {
    const r = validateUpload({ ...ok, fileName: "virus.exe", mimeType: "application/x-msdownload" });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/tipo/i);
  });

  it("rechaza un archivo demasiado grande", () => {
    const r = validateUpload({ ...ok, sizeBytes: MAX_FILE_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/tamaño|grande/i);
  });

  it("rechaza tamaño cero", () => {
    expect(validateUpload({ ...ok, sizeBytes: 0 }).ok).toBe(false);
  });
});

describe("materialKey", () => {
  it("prefija con la sesión y sanea el nombre", () => {
    const key = materialKey("abc-123", "Guía de Excel (v2).pdf");
    expect(key).toMatch(/^materials\/abc-123\/\d+-guia-de-excel-v2\.pdf$/);
  });

  it("neutraliza intentos de path traversal", () => {
    const key = materialKey("s1", "../../etc/passwd");
    expect(key).not.toContain("..");
    expect(key).toMatch(/^materials\/s1\//);
  });

  it("conserva la extensión en minúsculas", () => {
    expect(materialKey("s1", "REPORTE.PDF")).toMatch(/\.pdf$/);
  });
});
