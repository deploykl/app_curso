"use server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, courses, instructorProfiles } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { resolveCommissionRate } from "@/modules/catalog/service";
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
