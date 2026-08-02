"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, orderItems, enrollments, instructorEarnings, user } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { revocarCertificadoTx } from "@/modules/certification/issuance";
import { deleteObject } from "@/lib/r2";
import { sendEmail } from "@/modules/notifications/mailer";
import { refundProcessedTemplate } from "@/modules/notifications/templates/refund-processed";

export async function revocarAcceso(orderId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo del reembolso.");
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Orden no encontrada.");
  if (order.status === "refunded") return; // idempotente: ya se reembolsó antes
  if (order.status !== "paid") {
    throw new Error("Solo se pueden reembolsar órdenes pagadas.");
  }

  const pdfKeyAEliminar = await db.transaction(async (tx) => {
    await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, orderId));

    const [enr] = await tx.select({ id: enrollments.id })
      .from(enrollments).where(eq(enrollments.orderId, orderId)).limit(1);
    if (enr) {
      await tx.update(enrollments).set({ status: "refunded" }).where(eq(enrollments.id, enr.id));
    }

    const items = await tx.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await tx.update(instructorEarnings)
        .set({ status: "reversed" })
        .where(eq(instructorEarnings.orderItemId, item.id));
    }

    if (!enr) return null;
    const resultado = await revocarCertificadoTx(tx, enr.id, motivo);
    return resultado?.pdfKey ?? null;
  });

  if (pdfKeyAEliminar) {
    try {
      await deleteObject(pdfKeyAEliminar);
    } catch (err) {
      console.error("Error borrando el PDF del certificado revocado por reembolso:", pdfKeyAEliminar, err);
    }
  }

  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const [buyer] = await db.select().from(user).where(eq(user.id, order.userId)).limit(1);
  if (item && buyer) {
    const { subject, html } = refundProcessedTemplate({
      name: buyer.name, courseTitle: item.titleSnapshot, motivo: motivo.trim(),
    });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "refund-processed", subject, html });
  }

  revalidatePath("/admin/reembolsos");
}
