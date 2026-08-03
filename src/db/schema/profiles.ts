import { pgEnum, pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const profileStatus = pgEnum("profile_status", ["pending", "approved"]);

// Cómo le deposita el admin sus ganancias a este instructor (pago manual,
// fuera de la app, igual que el alumno le paga a la academia).
export const payoutMethod = pgEnum("payout_method", ["yape", "plin", "transferencia", "interbancario"]);

export const instructorProfiles = pgTable("instructor_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  headline: text("headline"),
  bioMd: text("bio_md"),
  avatarUrl: text("avatar_url"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("30.00"),
  payoutMethod: payoutMethod("payout_method"),
  payoutHolderName: text("payout_holder_name"),
  // Teléfono (Yape/Plin) o número de cuenta/CCI (transferencia/interbancario).
  payoutIdentifier: text("payout_identifier"),
  payoutBankName: text("payout_bank_name"),
  payoutQrImageKey: text("payout_qr_image_key"),
  status: profileStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
