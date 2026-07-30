import { pgEnum, pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const profileStatus = pgEnum("profile_status", ["pending", "approved"]);

export const instructorProfiles = pgTable("instructor_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  headline: text("headline"),
  bioMd: text("bio_md"),
  avatarUrl: text("avatar_url"),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("30.00"),
  bankHolder: text("bank_holder"),
  bankName: text("bank_name"),
  bankCci: text("bank_cci"),
  status: profileStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
