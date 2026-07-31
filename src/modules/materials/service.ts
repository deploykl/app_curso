import { slugify } from "@/lib/slug";

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
]);

export interface UploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateUpload(input: UploadInput):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, reason: `Tipo de archivo no permitido: ${input.mimeType}` };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, reason: "El archivo está vacío." };
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    return { ok: false, reason: `El archivo excede el tamaño máximo de 25 MB.` };
  }
  return { ok: true };
}

export function materialKey(sessionId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const base = slugify(dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 60);
  const suffix = ext ? `.${ext}` : "";
  return `materials/${sessionId}/${Date.now()}-${base}${suffix}`;
}
