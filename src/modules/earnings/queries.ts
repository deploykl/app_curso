import { desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { instructorEarnings, instructorProfiles, orderItems, orders, payouts, user } from "@/db/schema";

/*
  `instructor_earnings.status` solo pasa de "pending" a "reversed" (si se
  reembolsa la orden) o a "paid" (cuando se liquida un payout, que hoy nadie
  arma desde la UI). No hay un cron que lo mueva de "pending" a "available"
  al cumplirse `availableAt` — así que para mostrarle algo útil al instructor
  y al admin, la "disponibilidad" se calcula en la consulta comparando
  `availableAt` con la fecha actual, sin tocar la columna real.
*/
const disponibleExpr = sql<boolean>`${instructorEarnings.status} = 'pending' and ${instructorEarnings.availableAt} <= now()`;

export interface EarningsSummary {
  pendienteCents: number;
  disponibleCents: number;
  pagadoCents: number;
  totalCents: number;
}

export interface EarningRow {
  id: string;
  courseTitle: string;
  orderNumber: string;
  paidAt: Date | null;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  /** % de comisión realmente aplicado a esta venta, derivado de bruto/comisión — no el % actual del instructor, que puede haber cambiado después. */
  commissionRatePct: number;
  status: "pending" | "available" | "paid" | "reversed";
  availableAt: Date;
}

function withCommissionRatePct<T extends { grossCents: number; commissionCents: number }>(
  row: T
): T & { commissionRatePct: number } {
  return {
    ...row,
    commissionRatePct: row.grossCents > 0 ? Math.round((row.commissionCents / row.grossCents) * 10000) / 100 : 0,
  };
}

function summaryQuery(where?: SQL) {
  return db
    .select({
      pendienteCents: sql<number>`coalesce(sum(case when ${instructorEarnings.status} = 'pending' and not (${disponibleExpr}) then ${instructorEarnings.netCents} else 0 end), 0)`,
      disponibleCents: sql<number>`coalesce(sum(case when ${disponibleExpr} then ${instructorEarnings.netCents} else 0 end), 0)`,
      pagadoCents: sql<number>`coalesce(sum(case when ${instructorEarnings.status} = 'paid' then ${instructorEarnings.netCents} else 0 end), 0)`,
      totalCents: sql<number>`coalesce(sum(case when ${instructorEarnings.status} <> 'reversed' then ${instructorEarnings.netCents} else 0 end), 0)`,
    })
    .from(instructorEarnings)
    .where(where);
}

export async function getInstructorEarningsSummary(instructorId: string): Promise<EarningsSummary> {
  const [row] = await summaryQuery(eq(instructorEarnings.instructorId, instructorId));
  return {
    pendienteCents: Number(row?.pendienteCents ?? 0),
    disponibleCents: Number(row?.disponibleCents ?? 0),
    pagadoCents: Number(row?.pagadoCents ?? 0),
    totalCents: Number(row?.totalCents ?? 0),
  };
}

export async function getGlobalEarningsSummary(): Promise<EarningsSummary> {
  const [row] = await summaryQuery();
  return {
    pendienteCents: Number(row?.pendienteCents ?? 0),
    disponibleCents: Number(row?.disponibleCents ?? 0),
    pagadoCents: Number(row?.pagadoCents ?? 0),
    totalCents: Number(row?.totalCents ?? 0),
  };
}

function statusFor(row: { status: string; availableAt: Date }): EarningRow["status"] {
  if (row.status === "pending" && row.availableAt <= new Date()) return "available";
  return row.status as EarningRow["status"];
}

export async function listInstructorEarnings(instructorId: string): Promise<EarningRow[]> {
  const rows = await db
    .select({
      id: instructorEarnings.id,
      courseTitle: orderItems.titleSnapshot,
      orderNumber: orders.orderNumber,
      paidAt: orders.paidAt,
      grossCents: instructorEarnings.grossCents,
      commissionCents: instructorEarnings.commissionCents,
      netCents: instructorEarnings.netCents,
      status: instructorEarnings.status,
      availableAt: instructorEarnings.availableAt,
    })
    .from(instructorEarnings)
    .innerJoin(orderItems, eq(orderItems.id, instructorEarnings.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(instructorEarnings.instructorId, instructorId))
    .orderBy(desc(orders.paidAt));

  return rows.map((r) => withCommissionRatePct({ ...r, status: statusFor(r) }));
}

export interface InstructorEarningsTotal {
  instructorId: string;
  instructorName: string;
  commissionRate: number;
  pendienteCents: number;
  disponibleCents: number;
  pagadoCents: number;
  totalCents: number;
  payoutMethod: "yape" | "plin" | "transferencia" | "interbancario" | null;
  payoutHolderName: string | null;
  payoutIdentifier: string | null;
  payoutBankName: string | null;
  hasPayoutQr: boolean;
}

export async function listEarningsByInstructor(): Promise<InstructorEarningsTotal[]> {
  const rows = await db
    .select({
      instructorId: instructorEarnings.instructorId,
      instructorName: user.name,
      commissionRate: instructorProfiles.commissionRate,
      pendienteCents: sql<number>`coalesce(sum(case when ${instructorEarnings.status} = 'pending' and not (${disponibleExpr}) then ${instructorEarnings.netCents} else 0 end), 0)`,
      disponibleCents: sql<number>`coalesce(sum(case when ${disponibleExpr} then ${instructorEarnings.netCents} else 0 end), 0)`,
      pagadoCents: sql<number>`coalesce(sum(case when ${instructorEarnings.status} = 'paid' then ${instructorEarnings.netCents} else 0 end), 0)`,
      totalCents: sql<number>`coalesce(sum(case when ${instructorEarnings.status} <> 'reversed' then ${instructorEarnings.netCents} else 0 end), 0)`,
      payoutMethod: instructorProfiles.payoutMethod,
      payoutHolderName: instructorProfiles.payoutHolderName,
      payoutIdentifier: instructorProfiles.payoutIdentifier,
      payoutBankName: instructorProfiles.payoutBankName,
      hasPayoutQr: sql<boolean>`${instructorProfiles.payoutQrImageKey} is not null`,
    })
    .from(instructorEarnings)
    .innerJoin(user, eq(user.id, instructorEarnings.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, instructorEarnings.instructorId))
    .groupBy(
      instructorEarnings.instructorId,
      user.name,
      instructorProfiles.commissionRate,
      instructorProfiles.payoutMethod,
      instructorProfiles.payoutHolderName,
      instructorProfiles.payoutIdentifier,
      instructorProfiles.payoutBankName,
      instructorProfiles.payoutQrImageKey
    )
    .orderBy(user.name);

  return rows.map((r) => ({
    ...r,
    commissionRate: Number(r.commissionRate ?? 30),
    pendienteCents: Number(r.pendienteCents),
    disponibleCents: Number(r.disponibleCents),
    pagadoCents: Number(r.pagadoCents),
    totalCents: Number(r.totalCents),
  }));
}

export interface PayoutRow {
  id: string;
  instructorName: string;
  totalCents: number;
  paidAt: Date | null;
  reference: string | null;
  hasProof: boolean;
}

export async function listPayouts(instructorId?: string): Promise<PayoutRow[]> {
  const rows = await db
    .select({
      id: payouts.id,
      instructorName: user.name,
      totalCents: payouts.totalCents,
      paidAt: payouts.paidAt,
      reference: payouts.reference,
      hasProof: sql<boolean>`${payouts.proofFileKey} is not null`,
    })
    .from(payouts)
    .innerJoin(user, eq(user.id, payouts.instructorId))
    .where(instructorId ? eq(payouts.instructorId, instructorId) : undefined)
    .orderBy(desc(payouts.paidAt))
    .limit(100);

  return rows;
}

export async function listAllEarnings(): Promise<(EarningRow & { instructorName: string })[]> {
  const rows = await db
    .select({
      id: instructorEarnings.id,
      courseTitle: orderItems.titleSnapshot,
      orderNumber: orders.orderNumber,
      paidAt: orders.paidAt,
      grossCents: instructorEarnings.grossCents,
      commissionCents: instructorEarnings.commissionCents,
      netCents: instructorEarnings.netCents,
      status: instructorEarnings.status,
      availableAt: instructorEarnings.availableAt,
      instructorName: user.name,
    })
    .from(instructorEarnings)
    .innerJoin(orderItems, eq(orderItems.id, instructorEarnings.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(user, eq(user.id, instructorEarnings.instructorId))
    .orderBy(desc(orders.paidAt))
    .limit(200);

  return rows.map((r) => withCommissionRatePct({ ...r, status: statusFor(r) }));
}
