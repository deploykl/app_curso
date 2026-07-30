import { pgTable, text, timestamp, numeric, uuid } from "drizzle-orm/pg-core";
import { enrollments } from "./enrollment";

export const certificates = pgTable("certificates", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull().unique()
    .references(() => enrollments.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  studentName: text("student_name").notNull(),
  courseTitle: text("course_title").notNull(),
  instructorName: text("instructor_name").notNull(),
  academyName: text("academy_name").notNull(),
  hours: numeric("hours", { precision: 5, scale: 2 }),
  finalScore: numeric("final_score", { precision: 5, scale: 2 }).notNull(),
  pdfKey: text("pdf_key"),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokeReason: text("revoke_reason"),
});
