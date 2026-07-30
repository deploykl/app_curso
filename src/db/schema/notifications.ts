import { pgEnum, pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { enrollments } from "./enrollment";
import { classSessions } from "./sessions";

export const reminderKind = pgEnum("reminder_kind", ["24h", "1h"]);

export const emailLog = pgTable("email_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  toEmail: text("to_email").notNull(),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  providerId: text("provider_id"),
  status: text("status").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  error: text("error"),
});

export const sessionRemindersSent = pgTable("session_reminders_sent", {
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  classSessionId: uuid("class_session_id").notNull().references(() => classSessions.id, { onDelete: "cascade" }),
  kind: reminderKind("kind").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("reminder_uq").on(t.enrollmentId, t.classSessionId, t.kind)]);
