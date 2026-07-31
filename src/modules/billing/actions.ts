"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, orderItems, courses, instructorProfiles, paymentProofs } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { resolveCommissionRate, limaLocalToUtc } from "@/modules/catalog/service";
import { verifyTurnstile } from "@/lib/turnstile";
import { computeOrderTotals, computeCommission, isCouponValid, ORDER_EXPIRES_HOURS } from "./service";
import { nextOrderNumber, findCouponByCode } from "./queries";

export async function crearOrden(courseId: string, couponCode?: string) {
  const u = await requireUser();
  if (!u.emailVerified) {
    throw new Error("Verifica tu correo antes de comprar un curso.");
  }

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course || course.status !== "published") {
    throw new Error("Este curso no está disponible.");
  }
  if (await isEnrolled(u.id, courseId)) {
    throw new Error("Ya estás inscrito en este curso.");
  }

  let coupon: Awaited<ReturnType<typeof findCouponByCode>> = null;
  if (couponCode) {
    coupon = await findCouponByCode(couponCode);
    if (!coupon) throw new Error("El cupón no existe.");
    const check = isCouponValid(coupon, courseId, new Date());
    if (!check.ok) throw new Error(check.reason);
  }

  const totals = computeOrderTotals(
    course.priceCents,
    coupon ? { type: coupon.type, value: coupon.value } : null
  );

  const [profile] = await db.select().from(instructorProfiles)
    .where(eq(instructorProfiles.userId, course.instructorId)).limit(1);
  const commissionRate = resolveCommissionRate(
    course.commissionRateOverride,
    profile?.commissionRate ?? "30.00"
  );
  const { commissionCents, netCents } = computeCommission(totals.totalCents, commissionRate);

  const orderNumber = await nextOrderNumber();
  const expiresAt = new Date(Date.now() + ORDER_EXPIRES_HOURS * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    const [order] = await tx.insert(orders).values({
      userId: u.id,
      orderNumber,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      status: "pending",
      provider: "manual",
      expiresAt,
    }).returning({ id: orders.id });

    await tx.insert(orderItems).values({
      orderId: order.id,
      courseId: course.id,
      instructorId: course.instructorId,
      titleSnapshot: course.title,
      unitPriceCents: totals.totalCents,
      commissionRate,
      commissionCents,
      netCents,
    });
  });

  return { orderNumber };
}

const proofSchema = z.object({
  method: z.enum(["yape", "plin", "transferencia"]),
  payerFullName: z.string().trim().min(3).max(160),
  payerDni: z.string().trim().min(6).max(20),
  operationNumber: z.string().trim().min(1).max(60),
  declaredAmountCents: z.coerce.number().int().positive(),
  transferredAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  fileKey: z.string().trim().min(1),
  turnstileToken: z.string(),
});

export async function submitPaymentProof(orderId: string, raw: unknown) {
  const u = await requireUser();
  const input = proofSchema.parse(raw);

  const ok = await verifyTurnstile(input.turnstileToken);
  if (!ok) throw new Error("Verificación de seguridad inválida.");

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.userId !== u.id) throw new Error("Orden no encontrada.");
  if (order.status !== "pending") throw new Error("Esta orden ya no admite comprobantes.");

  await db.insert(paymentProofs).values({
    orderId,
    method: input.method,
    payerFullName: input.payerFullName,
    payerDni: input.payerDni,
    operationNumber: input.operationNumber,
    declaredAmountCents: input.declaredAmountCents,
    transferredAt: limaLocalToUtc(input.transferredAtLocal),
    proofFileKey: input.fileKey,
    status: "pending",
  });
}
