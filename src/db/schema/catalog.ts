import { pgEnum, pgTable, text, integer, timestamp, numeric, uuid, index } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const courseLevel = pgEnum("course_level", ["basico", "intermedio", "avanzado"]);
export const courseStatus = pgEnum("course_status", ["draft", "published", "archived"]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  categoryId: uuid("category_id").references(() => categories.id),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  descriptionMd: text("description_md"),
  coverUrl: text("cover_url"),
  level: courseLevel("level").notNull().default("basico"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("PEN"),
  status: courseStatus("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  estimatedHours: numeric("estimated_hours", { precision: 5, scale: 2 }),
  commissionRateOverride: numeric("commission_rate_override", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("courses_status_idx").on(t.status),
  index("courses_instructor_idx").on(t.instructorId),
]);

export const courseOutcomes = pgTable("course_outcomes", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});

export const courseRequirements = pgTable("course_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  orderIndex: integer("order_index").notNull().default(0),
});
