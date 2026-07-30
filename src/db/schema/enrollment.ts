import { pgEnum, pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./catalog";
import { classSessions } from "./sessions";
import { orders } from "./billing";

export const enrollmentStatus = pgEnum("enrollment_status", ["active", "refunded", "revoked"]);

export const enrollments = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").notNull().references(() => courses.id),
  orderId: uuid("order_id").references(() => orders.id),
  status: enrollmentStatus("status").notNull().default("active"),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [unique("enrollments_user_course_uq").on(t.userId, t.courseId)]);

export const sessionAttendance = pgTable("session_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull()
    .references(() => enrollments.id, { onDelete: "cascade" }),
  classSessionId: uuid("class_session_id").notNull()
    .references(() => classSessions.id, { onDelete: "cascade" }),
  markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("attendance_uq").on(t.enrollmentId, t.classSessionId)]);
