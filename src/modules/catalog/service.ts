import { z } from "zod";

export const courseInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subtitle: z.string().trim().max(240).optional(),
  descriptionMd: z.string().trim().max(20_000).optional(),
  categoryId: z.string().uuid().optional(),
  level: z.enum(["basico", "intermedio", "avanzado"]),
  priceSoles: z.coerce.number().min(0).max(100_000),
  estimatedHours: z.coerce.number().min(0).max(1000).optional(),
});

export type CourseInput = z.infer<typeof courseInputSchema>;

export function resolveCommissionRate(
  courseOverride: string | null,
  profileRate: string
): string {
  return courseOverride ?? profileRate;
}

export interface PublishCheck {
  title: string;
  priceCents: number;
  sessionCount: number;
  estimatedHours: string | null;
}

export function canPublish(c: PublishCheck): { ok: true } | { ok: false; reason: string } {
  if (c.sessionCount < 1) return { ok: false, reason: "Agrega al menos una sesión antes de publicar." };
  if (c.estimatedHours === null) {
    return { ok: false, reason: "Indica las horas estimadas: se imprimen en el certificado." };
  }
  return { ok: true };
}
