import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, paymentProofs, paymentDestinations, coupons } from "@/db/schema";

export async function nextOrderNumber(): Promise<string> {
  const [{ value }] = await db.execute<{ value: number }>(
    sql`select nextval('order_number_seq') as value`
  );
  const year = new Date().getFullYear();
  return `PED-${year}-${String(value).padStart(4, "0")}`;
}

export async function getOrderByNumber(orderNumber: string) {
  const [row] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      orderNumber: orders.orderNumber,
      totalCents: orders.totalCents,
      status: orders.status,
      expiresAt: orders.expiresAt,
      courseTitle: orderItems.titleSnapshot,
      courseId: orderItems.courseId,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);
  return row ?? null;
}

/**
 * Orden pendiente y no vencida de este usuario para este curso, si la hay.
 * Evita crear una orden nueva cada vez que vuelve a la ficha del curso.
 */
export async function findPendingOrderForCourse(userId: string, courseId: string) {
  const [row] = await db
    .select({ orderNumber: orders.orderNumber, expiresAt: orders.expiresAt })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.courseId, courseId),
        eq(orders.status, "pending"),
        sql`${orders.expiresAt} > now()`
      )
    )
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

/**
 * Orden pendiente y no vencida de este usuario para este certificado, si la
 * hay. Igual que `findPendingOrderForCourse` pero para compras de certificado.
 */
export async function findPendingOrderForCertificate(userId: string, certificateId: string) {
  const [row] = await db
    .select({ orderNumber: orders.orderNumber, expiresAt: orders.expiresAt })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orderItems.certificateId, certificateId),
        eq(orders.status, "pending"),
        sql`${orders.expiresAt} > now()`
      )
    )
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(1);
  return row ?? null;
}

export async function getActivePaymentDestinations() {
  return db
    .select()
    .from(paymentDestinations)
    .where(eq(paymentDestinations.isActive, true))
    .orderBy(paymentDestinations.orderIndex);
}

/** Para el CRUD del admin: incluye los destinos inactivos, que no se muestran en `/pago`. */
export async function listAllPaymentDestinations() {
  return db.select().from(paymentDestinations).orderBy(paymentDestinations.orderIndex);
}

export async function findCouponByCode(code: string) {
  const [row] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  return row ?? null;
}

export interface PendingProofRow {
  proofId: string;
  orderId: string;
  orderNumber: string;
  method: "yape" | "plin" | "transferencia";
  payerFullName: string;
  payerDni: string;
  declaredAmountCents: number;
  proofFileKey: string;
  submittedAt: Date;
  totalCents: number;
  courseTitle: string;
  buyerName: string;
}

export async function listPendingProofs(): Promise<PendingProofRow[]> {
  const { user } = await import("@/db/schema");
  const rows = await db
    .select({
      proofId: paymentProofs.id,
      orderId: paymentProofs.orderId,
      orderNumber: orders.orderNumber,
      method: paymentProofs.method,
      payerFullName: paymentProofs.payerFullName,
      payerDni: paymentProofs.payerDni,
      declaredAmountCents: paymentProofs.declaredAmountCents,
      proofFileKey: paymentProofs.proofFileKey,
      submittedAt: paymentProofs.submittedAt,
      totalCents: orders.totalCents,
      courseTitle: orderItems.titleSnapshot,
      buyerName: user.name,
    })
    .from(paymentProofs)
    .innerJoin(orders, eq(orders.id, paymentProofs.orderId))
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(user, eq(user.id, orders.userId))
    .where(eq(paymentProofs.status, "pending"))
    .orderBy(paymentProofs.submittedAt);
  return rows;
}
