"use server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, orderItems, courses, instructorProfiles, paymentProofs, paymentDestinations, enrollments, instructorEarnings, certificates, user } from "@/db/schema";
import { requireUser, assertRole } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { resolveCommissionRate } from "@/modules/catalog/service";
import { verifyTurnstile } from "@/lib/turnstile";
import { computeOrderTotals, computeCommission, isCouponValid, ORDER_EXPIRES_HOURS } from "./service";
import { nextOrderNumber, findCouponByCode, findPendingOrderForCertificate } from "./queries";
import { getPlatformSettings } from "@/modules/settings/queries";
import { env } from "@/env";
import { sendEmail } from "@/modules/notifications/mailer";
import { paymentProofReceivedTemplate } from "@/modules/notifications/templates/payment-proof-received";
import { orderApprovedTemplate } from "@/modules/notifications/templates/order-approved";
import { orderRejectedTemplate } from "@/modules/notifications/templates/order-rejected";

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Inserta o reactiva la inscripción de un curso pagado (o gratis). Misma
 * lógica en ambos casos: si el alumno ya tenía una inscripción reembolsada
 * para este curso, el UNIQUE (userId, courseId) hace que el INSERT choque —
 * reactivamos esa fila en vez de descartar el conflicto (ver comentario
 * histórico en `aprobarPago`).
 */
async function activarInscripcion(
  tx: Transaccion,
  args: { userId: string; courseId: string; orderId: string; now: Date }
) {
  await tx.insert(enrollments)
    .values({ userId: args.userId, courseId: args.courseId, orderId: args.orderId, status: "active" })
    .onConflictDoUpdate({
      target: [enrollments.userId, enrollments.courseId],
      set: { status: "active", orderId: args.orderId, enrolledAt: args.now },
    });
}

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
  // Un curso gratis (o con cupón que lo deja en S/ 0) no necesita comprobante
  // ni aprobación manual: se inscribe de inmediato. La orden igual se guarda
  // (ya paga, monto 0) para que el historial y `revocarAcceso` sigan
  // funcionando igual que con una orden pagada.
  const esGratis = totals.totalCents === 0;
  const now = new Date();

  await db.transaction(async (tx) => {
    const [order] = await tx.insert(orders).values({
      userId: u.id,
      orderNumber,
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      status: esGratis ? "paid" : "pending",
      provider: "manual",
      paidAt: esGratis ? now : null,
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

    if (esGratis) {
      await activarInscripcion(tx, { userId: u.id, courseId: course.id, orderId: order.id, now });
    }
  });

  return { orderNumber, freeEnrollment: esGratis };
}

const proofSchema = z.object({
  method: z.enum(["yape", "plin", "transferencia"]),
  payerFullName: z.string().trim().min(3).max(160),
  payerDni: z.string().trim().regex(/^\d{8}$/, "El DNI debe tener 8 dígitos numéricos."),
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

    if (item.itemType === "certificado") {
      if (!item.certificateId) throw new Error("La orden de certificado no tiene certificado asociado.");
      await tx.update(certificates).set({ paidAt: now }).where(eq(certificates.id, item.certificateId));
    } else {
      // Si el alumno ya tenía una inscripción para este curso (por ejemplo,
      // una previamente reembolsada por `revocarAcceso`), el UNIQUE
      // (userId, courseId) hace que el INSERT choque — `activarInscripcion`
      // reactiva esa fila en vez de descartar el conflicto (ver su comentario).
      await activarInscripcion(tx, { userId: order.userId, courseId: item.courseId, orderId: order.id, now });
    }

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

/**
 * Crea una orden para desbloquear el certificado de un curso ya aprobado por
 * examen (`certificates` ya existe, emitido con `paidAt: null`). Reutiliza la
 * misma tubería de `orders`/`paymentProofs`/aprobación manual que un curso.
 */
export async function crearOrdenCertificado(courseId: string) {
  const u = await requireUser();

  const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) throw new Error("Curso no encontrado.");
  if (!course.certificatePriceCents || course.certificatePriceCents <= 0) {
    throw new Error("El certificado de este curso no tiene costo.");
  }

  const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.userId, u.id), eq(enrollments.courseId, courseId), eq(enrollments.status, "active")))
    .limit(1);
  if (!enrollment) throw new Error("No estás inscrito en este curso.");

  const [certificate] = await db.select({ id: certificates.id, paidAt: certificates.paidAt })
    .from(certificates).where(eq(certificates.enrollmentId, enrollment.id)).limit(1);
  if (!certificate) throw new Error("Aún no apruebas el examen de este curso.");
  if (certificate.paidAt) throw new Error("Ya pagaste este certificado.");

  const pending = await findPendingOrderForCertificate(u.id, certificate.id);
  if (pending) return { orderNumber: pending.orderNumber, freeEnrollment: false };

  const [profile] = await db.select().from(instructorProfiles)
    .where(eq(instructorProfiles.userId, course.instructorId)).limit(1);
  const commissionRate = resolveCommissionRate(
    course.commissionRateOverride,
    profile?.commissionRate ?? "30.00"
  );
  const { commissionCents, netCents } = computeCommission(course.certificatePriceCents, commissionRate);

  const orderNumber = await nextOrderNumber();
  const expiresAt = new Date(Date.now() + ORDER_EXPIRES_HOURS * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    const [order] = await tx.insert(orders).values({
      userId: u.id,
      orderNumber,
      subtotalCents: course.certificatePriceCents!,
      discountCents: 0,
      totalCents: course.certificatePriceCents!,
      status: "pending",
      provider: "manual",
      expiresAt,
    }).returning({ id: orders.id });

    await tx.insert(orderItems).values({
      orderId: order.id,
      courseId: course.id,
      instructorId: course.instructorId,
      titleSnapshot: `Certificado: ${course.title}`,
      itemType: "certificado",
      certificateId: certificate.id,
      unitPriceCents: course.certificatePriceCents!,
      commissionRate,
      commissionCents,
      netCents,
    });
  });

  return { orderNumber, freeEnrollment: false };
}

const destinoSchema = z.object({
  method: z.enum(["yape", "plin", "transferencia"]),
  holderName: z.string().trim().min(2).max(160),
  identifier: z.string().trim().min(3).max(40),
  bankName: z.string().trim().max(120).optional(),
  qrImageKey: z.string().trim().max(500).optional(),
  instructionsMd: z.string().trim().max(500).optional(),
  isActive: z.boolean(),
  orderIndex: z.number().int().min(0).max(999),
});

/** Crea o actualiza un destino de pago (a dónde le paga el alumno a la academia). */
export async function guardarDestinoPagoAction(id: string | null, raw: unknown): Promise<void> {
  await assertRole(["admin"]);
  const input = destinoSchema.parse(raw);

  const values = {
    method: input.method,
    holderName: input.holderName,
    identifier: input.identifier,
    bankName: input.bankName || null,
    qrImageKey: input.qrImageKey || null,
    instructionsMd: input.instructionsMd || null,
    isActive: input.isActive,
    orderIndex: input.orderIndex,
  };

  if (id) {
    await db.update(paymentDestinations).set(values).where(eq(paymentDestinations.id, id));
  } else {
    await db.insert(paymentDestinations).values(values);
  }

  revalidatePath("/admin/configuracion");
}

export async function eliminarDestinoPagoAction(id: string): Promise<void> {
  await assertRole(["admin"]);
  await db.delete(paymentDestinations).where(eq(paymentDestinations.id, id));
  revalidatePath("/admin/configuracion");
}
