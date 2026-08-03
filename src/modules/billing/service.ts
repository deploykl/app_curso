export interface CouponInput {
  type: "percent" | "fixed";
  value: number;
}

export function computeOrderTotals(
  priceCents: number,
  coupon: CouponInput | null
): { subtotalCents: number; discountCents: number; totalCents: number } {
  const subtotalCents = priceCents;
  let discountCents = 0;
  if (coupon) {
    discountCents = coupon.type === "percent"
      ? Math.round((subtotalCents * coupon.value) / 100)
      : coupon.value;
    discountCents = Math.min(discountCents, subtotalCents);
  }
  return { subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

export interface CouponRow {
  isActive: boolean;
  courseId: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  maxUses: number | null;
  usedCount: number;
}

export function isCouponValid(
  coupon: CouponRow,
  courseId: string,
  now: Date
): { ok: true } | { ok: false; reason: string } {
  if (!coupon.isActive) return { ok: false, reason: "El cupón no está activo." };
  if (coupon.courseId && coupon.courseId !== courseId) {
    return { ok: false, reason: "El cupón no aplica a este curso." };
  }
  if (coupon.validFrom && now < coupon.validFrom) {
    return { ok: false, reason: "El cupón todavía no está vigente." };
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    return { ok: false, reason: "El cupón venció." };
  }
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: "El cupón alcanzó su límite de usos." };
  }
  return { ok: true };
}

export function computeCommission(
  unitPriceCents: number,
  commissionRate: string
): { commissionCents: number; netCents: number } {
  const commissionCents = Math.round((unitPriceCents * Number(commissionRate)) / 100);
  return { commissionCents, netCents: unitPriceCents - commissionCents };
}

export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PROOF_MIME_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);

export interface ProofUploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateProofUpload(input: ProofUploadInput):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!ALLOWED_PROOF_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, reason: `Tipo de archivo no permitido: ${input.mimeType}` };
  }
  if (input.sizeBytes <= 0) return { ok: false, reason: "El archivo está vacío." };
  if (input.sizeBytes > MAX_PROOF_BYTES) {
    return { ok: false, reason: "El comprobante excede el tamaño máximo de 10 MB." };
  }
  return { ok: true };
}

export function destinationQrKey(destinationId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const suffix = ext ? `.${ext}` : "";
  return `payment-destinations/${destinationId}/${Date.now()}${suffix}`;
}

export function proofKey(orderId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const suffix = ext ? `.${ext}` : "";
  return `payment-proofs/${orderId}/${Date.now()}${suffix}`;
}

export const ORDER_EXPIRES_HOURS = 48;
