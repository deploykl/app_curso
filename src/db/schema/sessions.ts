import { pgEnum, pgTable, text, integer, timestamp, boolean, uuid, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { courses } from "./catalog";

export const classSessionStatus = pgEnum("class_session_status", [
  "scheduled", "live", "completed", "cancelled",
]);

export const classSessions = pgTable("class_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").notNull().default(0),
  title: text("title").notNull(),
  descriptionMd: text("description_md"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  zoomUrl: text("zoom_url"),
  recordingUrl: text("recording_url"),
  recordingAddedAt: timestamp("recording_added_at", { withTimezone: true }),
  isFreePreview: boolean("is_free_preview").notNull().default(false),
  status: classSessionStatus("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("class_sessions_starts_at_idx").on(t.startsAt, t.status)]);

export const sessionMaterials = pgTable("session_materials", {
  id: uuid("id").primaryKey().defaultRandom(),
  classSessionId: uuid("class_session_id").notNull()
    .references(() => classSessions.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fileKey: text("file_key"),
  externalUrl: text("external_url"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("material_source_xor", sql`(${t.fileKey} is null) <> (${t.externalUrl} is null)`),
]);
