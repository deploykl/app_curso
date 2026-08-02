import { pgEnum, pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { orderItems } from "./billing";

export const earningStatus = pgEnum("earning_status", ["pending", "available", "paid", "reversed"]);
export const payoutStatus = pgEnum("payout_status", ["draft", "paid"]);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  totalCents: integer("total_cents").notNull(),
  status: payoutStatus("status").notNull().default("draft"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference"),
  notes: text("notes"),
  /** Captura del Yape/Plin/transferencia hecho al instructor — la evidencia del pago. */
  proofFileKey: text("proof_file_key"),
});

export const instructorEarnings = pgTable("instructor_earnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderItemId: uuid("order_item_id").notNull().unique()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  grossCents: integer("gross_cents").notNull(),
  commissionCents: integer("commission_cents").notNull(),
  netCents: integer("net_cents").notNull(),
  status: earningStatus("status").notNull().default("pending"),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  payoutId: uuid("payout_id").references(() => payouts.id),
});
