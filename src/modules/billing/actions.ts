"use server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, orderItems, courses, instructorProfiles, paymentProofs, enrollments, instructorEarnings, user } from "@/db/schema";
import { requireUser, assertRole } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { resolveCommissionRate } from "@/modules/catalog/service";
import { verifyTurnstile } from "@/lib/turnstile";
import { computeOrderTotals, computeCommission, isCouponValid, ORDER_EXPIRES_HOURS } from "./service";
import { nextOrderNumber, findCouponByCode } from "./queries";
import { getPlatformSettings } from "@/modules/settings/queries";
import { env } from "@/env";
import { sendEmail } from "@/modules/notifications/mailer";
import { paymentProofReceivedTemplate } from "@/modules/notifications/templates/payment-proof-received";
import { orderApprovedTemplate } from "@/modules/notifications/templates/order-approved";
import { orderRejectedTemplate } from "@/modules/notifications/templates/order-rejected";

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

  let coupon: Awaited<ReturnType<typeof findCouponByCode>> | null = null;
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

  const [existingPending] = await db.select().from(paymentProofs)
    .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pending")))
    .limit(1);
  if (existingPending) {
    throw new Error("Ya hay un comprobante pendiente de revisión para esta orden.");
  }

  await db.insert(paymentProofs).values({
    orderId,
    method: input.method,
    payerFullName: input.payerFullName,
    payerDni: input.payerDni,
    // El monto no se pide ni se acepta del cliente: siempre es el total de la
    // orden. Se guarda como snapshot por si el precio del curso cambia después.
    declaredAmountCents: order.totalCents,
    proofFileKey: input.fileKey,
    status: "pending",
  });

  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const { subject, html, text } = paymentProofReceivedTemplate({
    orderNumber: order.orderNumber, courseTitle: item?.titleSnapshot ?? "",
  });
  await sendEmail({ to: env.MAIL_FROM, template: "payment-proof-received", subject, html, text });
}

export async function aprobarPago(orderId: string) {
  const admin = await assertRole(["admin"]);
  const { earningAvailableDays } = await getPlatformSettings();

  const { alreadyPaid } = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("Orden no encontrada.");
    if (order.status === "paid") return { alreadyPaid: true }; // idempotente: ya se aprobó antes

    const [proof] = await tx.select().from(paymentProofs)
      .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pending")))
      .limit(1);
    if (!proof) throw new Error("No hay un comprobante pendiente para esta orden.");

    const [item] = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
    if (!item) throw new Error("La orden no tiene curso asociado.");

    const now = new Date();

    await tx.update(paymentProofs)
      .set({ status: "approved", reviewedBy: admin.id, reviewedAt: now })
      .where(eq(paymentProofs.id, proof.id));

    await tx.update(orders).set({ status: "paid", paidAt: now }).where(eq(orders.id, orderId));

    // Si el alumno ya tenía una inscripción para este curso (por ejemplo,
    // una previamente reembolsada por `revocarAcceso`), el UNIQUE
    // (userId, courseId) hace que el INSERT choque. Reactivamos esa fila en
    // vez de descartar el conflicto: si usáramos onConflictDoNothing, la
    // fila vieja se quedaría con status "refunded" y el orderId de la orden
    // reembolsada, dejando al alumno pagando sin acceso (todos los guards
    // filtran por status === "active") y a `revocarAcceso` sin forma de
    // encontrar esta inscripción por la orden nueva.
    await tx.insert(enrollments)
      .values({ userId: order.userId, courseId: item.courseId, orderId: order.id, status: "active" })
      .onConflictDoUpdate({
        target: [enrollments.userId, enrollments.courseId],
        set: { status: "active", orderId: order.id, enrolledAt: now },
      });

    const { commissionCents, netCents } = computeCommission(item.unitPriceCents, item.commissionRate);
    const availableAt = new Date(now.getTime() + earningAvailableDays * 24 * 60 * 60 * 1000);

    await tx.insert(instructorEarnings).values({
      orderItemId: item.id,
      instructorId: item.instructorId,
      grossCents: item.unitPriceCents,
      commissionCents,
      netCents,
      status: "pending",
      availableAt,
    }).onConflictDoNothing({ target: instructorEarnings.orderItemId });

    // El cupón, si lo hubo, ya quedó registrado en discountCents; sin una
    // referencia directa orders -> coupon en el esquema, la redención
    // detallada (coupon_redemptions) se registra en crearOrden cuando
    // aplica, no aquí (Fase 6 agregará la UI de cupones que ejercitará esto).

    return { alreadyPaid: false };
  });

  revalidatePath("/admin/pagos");

  // Solo notificamos por correo si esta llamada fue la que efectivamente
  // aprobó la orden. Si la transacción hizo el early-return idempotente
  // (orden ya estaba "paid"), no reenviamos el email de aprobación.
  if (alreadyPaid) return;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  if (!order || !item) return;
  const [buyer] = await db.select().from(user).where(eq(user.id, order.userId)).limit(1);
  if (buyer) {
    const { subject, html, text } = orderApprovedTemplate({ name: buyer.name, courseTitle: item.titleSnapshot });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "order-approved", subject, html, text });
  }
}

export async function rechazarPago(orderId: string, reason: string) {
  const u = await assertRole(["admin"]);
  const [proof] = await db.select().from(paymentProofs)
    .where(and(eq(paymentProofs.orderId, orderId), eq(paymentProofs.status, "pending")))
    .limit(1);
  if (!proof) throw new Error("No hay un comprobante pendiente para esta orden.");

  await db.update(paymentProofs).set({
    status: "rejected",
    reviewedBy: u.id,
    reviewedAt: new Date(),
    rejectionReason: reason,
  }).where(eq(paymentProofs.id, proof.id));

  revalidatePath("/admin/pagos");

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const [buyer] = order ? await db.select().from(user).where(eq(user.id, order.userId)).limit(1) : [];
  if (order && item && buyer) {
    const { subject, html, text } = orderRejectedTemplate({
      name: buyer.name, courseTitle: item.titleSnapshot, reason, orderNumber: order.orderNumber,
    });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "order-rejected", subject, html, text });
  }
}
