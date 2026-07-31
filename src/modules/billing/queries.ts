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

export async function getActivePaymentDestinations() {
  return db
    .select()
    .from(paymentDestinations)
    .where(eq(paymentDestinations.isActive, true))
    .orderBy(paymentDestinations.orderIndex);
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
  operationNumber: string;
  declaredAmountCents: number;
  transferredAt: Date;
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
      operationNumber: paymentProofs.operationNumber,
      declaredAmountCents: paymentProofs.declaredAmountCents,
      transferredAt: paymentProofs.transferredAt,
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
