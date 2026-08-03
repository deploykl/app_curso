import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  user, courses, orders, orderItems, paymentProofs, enrollments, instructorEarnings, certificates,
} from "@/db/schema";

let adminId: string;
let studentId: string;
let profId: string;
let orderId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: adminId, role: "admin", name: "Admin" })),
  requireUser: vi.fn(async () => ({ id: studentId, role: "student", name: "Alumno", emailVerified: true })),
}));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn(async () => true),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/notifications/mailer", () => ({
  sendEmail: vi.fn(async () => {}),
}));
vi.mock("@/lib/r2", () => ({
  usingR2: false,
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => Buffer.from("")),
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

const { aprobarPago, rechazarPago, submitPaymentProof } = await import("@/modules/billing/actions");
const { revocarAcceso } = await import("@/modules/refunds/actions");
const { sendEmail } = await import("@/modules/notifications/mailer");

async function setupOrder() {
  await db.delete(instructorEarnings);
  await db.delete(paymentProofs);
  // order_items referencia certificates (compras de certificado): debe
  // borrarse antes que certificates o la FK revienta el DELETE.
  await db.delete(orderItems);
  await db.delete(certificates);
  await db.delete(enrollments);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);

  const [a] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Admin", email: "adm@test.pe",
    emailVerified: true, role: "admin",
  }).returning();
  adminId = a.id;

  const [s] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  studentId = s.id;

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "curso-aprobar", title: "Curso", priceCents: 10000,
  }).returning();
  cursoId = c.id;

  const [o] = await db.insert(orders).values({
    userId: studentId, orderNumber: "PED-2026-9001",
    subtotalCents: 10000, totalCents: 10000, status: "pending",
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  }).returning();
  orderId = o.id;

  await db.insert(orderItems).values({
    orderId: o.id, courseId: c.id, instructorId: profId, titleSnapshot: "Curso",
    unitPriceCents: 10000, commissionRate: "30.00", commissionCents: 3000, netCents: 7000,
  });

  await db.insert(paymentProofs).values({
    orderId: o.id, method: "yape", payerFullName: "Alumno", payerDni: "12345678",
    declaredAmountCents: 10000,
    proofFileKey: "payment-proofs/x/1.png", status: "pending",
  });
}

beforeEach(setupOrder);

afterAll(async () => {
  await db.delete(instructorEarnings);
  await db.delete(paymentProofs);
  // order_items referencia certificates (compras de certificado): debe
  // borrarse antes que certificates o la FK revienta el DELETE.
  await db.delete(orderItems);
  await db.delete(certificates);
  await db.delete(enrollments);
  await db.delete(orders);
  await db.delete(courses);
  await db.delete(user);
});

describe("aprobarPago", () => {
  it("marca la orden pagada, inscribe al alumno y crea el earning", async () => {
    await aprobarPago(orderId);

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("paid");
    expect(o.paidAt).not.toBeNull();

    const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(proof.status).toBe("approved");
    expect(proof.reviewedBy).toBe(adminId);

    const [enr] = await db.select().from(enrollments)
      .where(eq(enrollments.userId, studentId));
    expect(enr.status).toBe("active");
    expect(enr.courseId).toBe(cursoId);

    const [earning] = await db.select().from(instructorEarnings);
    expect(earning.grossCents).toBe(10000);
    expect(earning.commissionCents).toBe(3000);
    expect(earning.netCents).toBe(7000);
    expect(earning.status).toBe("pending");
  });

  it("es idempotente: llamarlo dos veces no duplica inscripción ni earning", async () => {
    await aprobarPago(orderId);
    await aprobarPago(orderId);

    const enrollmentsRows = await db.select().from(enrollments).where(eq(enrollments.userId, studentId));
    expect(enrollmentsRows).toHaveLength(1);

    const earningsRows = await db.select().from(instructorEarnings);
    expect(earningsRows).toHaveLength(1);
  });

  it("no reenvía el email de aprobación al reaprobar una orden ya pagada", async () => {
    vi.mocked(sendEmail).mockClear();

    await aprobarPago(orderId);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({ template: "order-approved" });

    await aprobarPago(orderId);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("es atómica: si falla a mitad, no queda nada aplicado", async () => {
    const original = db.transaction.bind(db);
    const spy = vi.spyOn(db, "transaction").mockImplementationOnce(async () => {
      throw new Error("fallo forzado");
    });

    await expect(aprobarPago(orderId)).rejects.toThrow("fallo forzado");

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("pending");
    const enrollmentsRows = await db.select().from(enrollments).where(eq(enrollments.userId, studentId));
    expect(enrollmentsRows).toHaveLength(0);

    spy.mockRestore();
    void original;
  });

  it("reactiva el acceso al recomprar un curso previamente reembolsado (regresión C2)", async () => {
    // 1. Primera compra: se aprueba y queda una inscripción activa.
    await aprobarPago(orderId);

    // 2. El admin reembolsa esa orden: la inscripción pasa a "refunded"
    //    pero la fila (userId, courseId) no se borra (unique constraint).
    await revocarAcceso(orderId, "El alumno solicitó reembolso.");

    const [refundedEnr] = await db.select().from(enrollments)
      .where(eq(enrollments.userId, studentId));
    expect(refundedEnr.status).toBe("refunded");
    expect(refundedEnr.orderId).toBe(orderId);

    // 3. El alumno vuelve a comprar el mismo curso: nueva orden, nuevo comprobante.
    const [order2] = await db.insert(orders).values({
      userId: studentId, orderNumber: "PED-2026-9002",
      subtotalCents: 10000, totalCents: 10000, status: "pending",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning();

    await db.insert(orderItems).values({
      orderId: order2.id, courseId: cursoId, instructorId: profId, titleSnapshot: "Curso",
      unitPriceCents: 10000, commissionRate: "30.00", commissionCents: 3000, netCents: 7000,
    });

    await db.insert(paymentProofs).values({
      orderId: order2.id, method: "yape", payerFullName: "Alumno", payerDni: "12345678",
      declaredAmountCents: 10000,
      proofFileKey: "payment-proofs/x/2.png", status: "pending",
    });

    // 4. El admin aprueba la orden nueva: el acceso debe reactivarse.
    await aprobarPago(order2.id);

    const enrollmentsRows = await db.select().from(enrollments).where(eq(enrollments.userId, studentId));
    expect(enrollmentsRows).toHaveLength(1);
    expect(enrollmentsRows[0].status).toBe("active");
    expect(enrollmentsRows[0].orderId).toBe(order2.id);
  });

  it("aprueba una orden de certificado: desbloquea el certificado sin tocar enrollments", async () => {
    // El alumno ya está inscrito y aprobó el examen (certificado emitido, bloqueado).
    const [enr] = await db.insert(enrollments).values({
      userId: studentId, courseId: cursoId, status: "active",
    }).returning();
    const [cert] = await db.insert(certificates).values({
      enrollmentId: enr.id, code: "CERT-0001", studentName: "Alumno", courseTitle: "Curso",
      instructorName: "Prof", academyName: "Academia Demo", finalScore: "90.00",
    }).returning();

    const [certOrder] = await db.insert(orders).values({
      userId: studentId, orderNumber: "PED-2026-9010",
      subtotalCents: 5000, totalCents: 5000, status: "pending",
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    }).returning();
    await db.insert(orderItems).values({
      orderId: certOrder.id, courseId: cursoId, instructorId: profId,
      titleSnapshot: "Certificado: Curso", itemType: "certificado", certificateId: cert.id,
      unitPriceCents: 5000, commissionRate: "30.00", commissionCents: 1500, netCents: 3500,
    });
    await db.insert(paymentProofs).values({
      orderId: certOrder.id, method: "yape", payerFullName: "Alumno", payerDni: "12345678",
      declaredAmountCents: 5000,
      proofFileKey: "payment-proofs/x/cert.png", status: "pending",
    });

    await aprobarPago(certOrder.id);

    const [certRow] = await db.select().from(certificates).where(eq(certificates.id, cert.id));
    expect(certRow.paidAt).not.toBeNull();

    // No creó ninguna inscripción nueva para esta orden de certificado.
    const enrollmentsForOrder = await db.select().from(enrollments).where(eq(enrollments.orderId, certOrder.id));
    expect(enrollmentsForOrder).toHaveLength(0);
  });
});

describe("rechazarPago", () => {
  it("marca el comprobante rechazado con motivo, la orden sigue pendiente", async () => {
    await rechazarPago(orderId, "El nombre no coincide con el titular.");

    const [proof] = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(proof.status).toBe("rejected");
    expect(proof.rejectionReason).toBe("El nombre no coincide con el titular.");

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("pending");
  });

  it("permite subir un nuevo comprobante sobre la misma orden tras rechazar", async () => {
    await rechazarPago(orderId, "monto no coincide");

    await submitPaymentProof(orderId, {
      method: "yape",
      payerFullName: "Alumno Prueba",
      payerDni: "12345678",
      fileKey: "payment-proofs/x/2.png",
      turnstileToken: "token-valido",
    });

    const rows = await db.select().from(paymentProofs).where(eq(paymentProofs.orderId, orderId));
    expect(rows).toHaveLength(2);

    const pendingRows = rows.filter((r) => r.status === "pending");
    expect(pendingRows).toHaveLength(1);
    expect(pendingRows[0].proofFileKey).toBe("payment-proofs/x/2.png");

    const rejectedRows = rows.filter((r) => r.status === "rejected");
    expect(rejectedRows).toHaveLength(1);
  });
});
