import { pgEnum, pgTable, text, integer, timestamp, boolean, numeric, uuid, jsonb, unique, index, pgSequence } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./catalog";

export const orderStatus = pgEnum("order_status", [
  "pending", "paid", "failed", "expired", "refunded",
]);
export const paymentProvider = pgEnum("payment_provider", ["manual", "culqi"]);
export const paymentMethod = pgEnum("payment_method", ["yape", "plin", "transferencia"]);
export const proofStatus = pgEnum("proof_status", ["pending", "approved", "rejected"]);
export const couponType = pgEnum("coupon_type", ["percent", "fixed"]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id),
  orderNumber: text("order_number").notNull().unique(),
  subtotalCents: integer("subtotal_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  currency: text("currency").notNull().default("PEN"),
  status: orderStatus("status").notNull().default("pending"),
  provider: paymentProvider("provider").notNull().default("manual"),
  providerChargeId: text("provider_charge_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("orders_status_expires_idx").on(t.status, t.expiresAt)]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  titleSnapshot: text("title_snapshot").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
  commissionCents: integer("commission_cents").notNull(),
  netCents: integer("net_cents").notNull(),
});

export const paymentDestinations = pgTable("payment_destinations", {
  id: uuid("id").primaryKey().defaultRandom(),
  method: paymentMethod("method").notNull(),
  holderName: text("holder_name").notNull(),
  identifier: text("identifier").notNull(),
  bankName: text("bank_name"),
  qrImageKey: text("qr_image_key"),
  instructionsMd: text("instructions_md"),
  isActive: boolean("is_active").notNull().default(true),
  orderIndex: integer("order_index").notNull().default(0),
});

export const paymentProofs = pgTable("payment_proofs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  method: paymentMethod("method").notNull(),
  payerFullName: text("payer_full_name").notNull(),
  payerDni: text("payer_dni").notNull(),
  declaredAmountCents: integer("declared_amount_cents").notNull(),
  proofFileKey: text("proof_file_key").notNull(),
  status: proofStatus("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => user.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentEvents = pgTable("payment_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: paymentProvider("provider").notNull(),
  providerEventId: text("provider_event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
});

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  type: couponType("type").notNull(),
  value: integer("value").notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  courseId: uuid("course_id").references(() => courses.id),
  isActive: boolean("is_active").notNull().default(true),
});

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id),
}, (t) => [unique("coupon_redemption_uq").on(t.couponId, t.orderId)]);

export const orderNumberSeq = pgSequence("order_number_seq", {
  startWith: 1,
  increment: 1,
  minValue: 1,
});
