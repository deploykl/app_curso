import { z } from "zod";

export const courseInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subtitle: z.string().trim().max(240).optional(),
  descriptionMd: z.string().trim().max(20_000).optional(),
  categoryId: z.string().uuid().optional(),
  level: z.enum(["basico", "intermedio", "avanzado"]),
  priceSoles: z.coerce.number().min(0).max(100_000),
  // Vacío/0 = el certificado se entrega gratis al aprobar el examen.
  certificatePriceSoles: z.coerce.number().min(0).max(100_000).optional(),
});

export type CourseInput = z.infer<typeof courseInputSchema>;

/** El modo de dictado solo se elige al crear el curso: cambiarlo después dejaría sesiones inconsistentes (con/sin fecha). */
export const createCourseInputSchema = courseInputSchema.extend({
  deliveryMode: z.enum(["en_vivo", "grabado"]).default("en_vivo"),
});

export function resolveCommissionRate(
  courseOverride: string | null,
  profileRate: string
): string {
  return courseOverride ?? profileRate;
}

export interface PublishCheck {
  sessionCount: number;
}

export function canPublish(c: PublishCheck): { ok: true } | { ok: false; reason: string } {
  if (c.sessionCount < 1) return { ok: false, reason: "Agrega al menos una sesión antes de publicar." };
  return { ok: true };
}

const MEETING_HOSTS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com"];

export function isValidZoomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return MEETING_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Convierte "2026-08-15T10:00" entendido como hora de Lima a un Date en UTC. */
export function limaLocalToUtc(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) throw new Error(`Fecha y hora inválidas: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];

  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetMs = limaOffsetMs(new Date(asUtc));
  return new Date(asUtc - offsetMs);
}

export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export interface VideoUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateVideoUpload(input: VideoUploadInput):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!ALLOWED_VIDEO_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, reason: `Formato de video no permitido: ${input.mimeType}` };
  }
  if (input.sizeBytes <= 0) return { ok: false, reason: "El archivo está vacío." };
  if (input.sizeBytes > MAX_VIDEO_BYTES) {
    return { ok: false, reason: "El video excede el tamaño máximo de 1 GB." };
  }
  return { ok: true };
}

export function sessionVideoKey(sessionId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "mp4";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mp4";
  return `session-videos/${sessionId}/${Date.now()}.${ext}`;
}

/** Igual que sessionVideoKey, pero para subir el video desde "Detalles del curso" antes de que exista la sesión. */
export function courseVideoKey(courseId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "mp4";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "mp4";
  return `session-videos/${courseId}/${Date.now()}.${ext}`;
}

function limaOffsetMs(at: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second)
  );
  return asIfUtc - at.getTime();
}

export const classSessionInputSchema = z.discriminatedUnion("deliveryMode", [
  z.object({
    deliveryMode: z.literal("en_vivo"),
    descriptionMd: z.string().trim().max(5000).optional(),
    startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora requeridas"),
    durationMinutes: z.coerce.number().int().min(1).max(480),
    zoomUrl: z.string().trim().refine((v) => v === "" || isValidZoomUrl(v), {
      message: "Debe ser un enlace https de Zoom, Google Meet o Teams.",
    }).optional(),
    isFreePreview: z.coerce.boolean().default(false),
  }),
  z.object({
    deliveryMode: z.literal("grabado"),
    descriptionMd: z.string().trim().max(5000).optional(),
    durationMinutes: z.coerce.number().int().min(1).max(480),
    videoFileKey: z.string().trim().min(1).optional(),
    isFreePreview: z.coerce.boolean().default(false),
  }),
]);
