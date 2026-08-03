"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { orders, orderItems, enrollments, instructorEarnings, user } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { revocarCertificadoTx, bloquearCertificadoPorIdTx } from "@/modules/certification/issuance";
import { deleteObject } from "@/lib/r2";
import { sendEmail } from "@/modules/notifications/mailer";
import { refundProcessedTemplate } from "@/modules/notifications/templates/refund-processed";

export async function revocarAcceso(orderId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo del reembolso.");
  }

  // Chequeo rápido fuera de la transacción, solo para responder rápido en los
  // casos "no existe" / "nunca se pagó" sin pagar el costo de abrir una tx.
  // El chequeo de "ya está refunded" (el que importa para no duplicar el
  // envío del email bajo concurrencia) se repite DENTRO de la transacción —
  // ver el comentario ahí abajo.
  const [orderPrecheck] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!orderPrecheck) throw new Error("Orden no encontrada.");
  if (orderPrecheck.status !== "paid" && orderPrecheck.status !== "refunded") {
    throw new Error("Solo se pueden reembolsar órdenes pagadas.");
  }

  const { alreadyRefunded, pdfKeyAEliminar } = await db.transaction(async (tx) => {
    // Mismo patrón que `aprobarPago` en billing/actions.ts: el SELECT que
    // decide la idempotencia se hace DENTRO de la transacción, no antes. Si
    // dos llamadas a revocarAcceso para la misma orden se solapan (doble
    // clic), la segunda transacción bloquea en el UPDATE de `orders` hasta
    // que la primera confirma; al reanudarse ve `status = "refunded"` y
    // devuelve `alreadyRefunded: true` sin tocar nada más — así solo una de
    // las dos llamadas llega al bloque de `sendEmail` de más abajo.
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new Error("Orden no encontrada.");
    if (order.status === "refunded") {
      return { alreadyRefunded: true, pdfKeyAEliminar: null as string | null };
    }
    if (order.status !== "paid") {
      throw new Error("Solo se pueden reembolsar órdenes pagadas.");
    }

    await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, orderId));

    const items = await tx.select({ id: orderItems.id, itemType: orderItems.itemType, certificateId: orderItems.certificateId })
      .from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await tx.update(instructorEarnings)
        .set({ status: "reversed" })
        .where(eq(instructorEarnings.orderItemId, item.id));
    }

    // Una orden de certificado nunca crea una fila en `enrollments` (no
    // desinscribe del curso): solo vuelve a bloquear el certificado.
    const certificateItem = items.find((i) => i.itemType === "certificado" && i.certificateId);
    if (certificateItem?.certificateId) {
      const resultado = await bloquearCertificadoPorIdTx(tx, certificateItem.certificateId);
      return { alreadyRefunded: false, pdfKeyAEliminar: resultado?.pdfKey ?? null };
    }

    const [enr] = await tx.select({ id: enrollments.id })
      .from(enrollments).where(eq(enrollments.orderId, orderId)).limit(1);
    if (enr) {
      await tx.update(enrollments).set({ status: "refunded" }).where(eq(enrollments.id, enr.id));
    }

    if (!enr) return { alreadyRefunded: false, pdfKeyAEliminar: null as string | null };
    const resultado = await revocarCertificadoTx(tx, enr.id, motivo);
    return { alreadyRefunded: false, pdfKeyAEliminar: resultado?.pdfKey ?? null };
  });

  // Idempotente: esta llamada llegó tarde (la orden ya estaba refunded), no
  // reenviamos el email ni revalidamos — no hubo ningún efecto nuevo.
  if (alreadyRefunded) return;

  if (pdfKeyAEliminar) {
    try {
      await deleteObject(pdfKeyAEliminar);
    } catch (err) {
      console.error("Error borrando el PDF del certificado revocado por reembolso:", pdfKeyAEliminar, err);
    }
  }

  const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).limit(1);
  const [buyer] = await db.select().from(user).where(eq(user.id, orderPrecheck.userId)).limit(1);
  if (item && buyer) {
    const { subject, html, text } = refundProcessedTemplate({
      name: buyer.name, courseTitle: item.titleSnapshot, motivo: motivo.trim(),
    });
    await sendEmail({ to: buyer.email, userId: buyer.id, template: "refund-processed", subject, html, text });
  }

  revalidatePath("/admin/reembolsos");
}
