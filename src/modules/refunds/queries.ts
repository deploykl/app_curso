import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, user, enrollments } from "@/db/schema";

export interface OrdenParaReembolso {
  orderId: string;
  orderNumber: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded";
  totalCents: number;
  paidAt: Date | null;
  courseTitle: string;
  buyerName: string;
  buyerEmail: string;
  enrollmentId: string | null;
}

/**
 * Busca la orden a reembolsar por número exacto (si `query` no contiene
 * "@") o por email del comprador (si lo contiene). El admin normalmente ya
 * tiene uno de los dos a mano cuando procesa un reembolso.
 */
export async function buscarOrdenParaReembolso(query: string): Promise<OrdenParaReembolso | null> {
  const q = query.trim();
  if (!q) return null;

  const condicion = q.includes("@") ? eq(user.email, q) : eq(orders.orderNumber, q);

  const [row] = await db
    .select({
      orderId: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalCents: orders.totalCents,
      paidAt: orders.paidAt,
      courseTitle: orderItems.titleSnapshot,
      buyerName: user.name,
      buyerEmail: user.email,
      enrollmentId: enrollments.id,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(user, eq(user.id, orders.userId))
    .leftJoin(enrollments, eq(enrollments.orderId, orders.id))
    .where(condicion)
    .orderBy(sql`${orders.paidAt} desc nulls last`, desc(orders.createdAt))
    .limit(1);

  return row ?? null;
}
