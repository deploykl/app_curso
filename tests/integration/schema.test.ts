import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const EXPECTED = [
  "instructor_profiles", "categories", "courses", "course_outcomes",
  "course_requirements", "class_sessions", "session_materials",
  "enrollments", "session_attendance", "exams", "questions",
  "question_options", "exam_attempts", "exam_attempt_questions",
  "exam_attempt_answers", "certificates", "orders", "order_items",
  "payment_destinations", "payment_proofs", "payment_events",
  "coupons", "coupon_redemptions", "instructor_earnings", "payouts",
  "email_log", "session_reminders_sent",
];

describe("esquema completo", () => {
  it("creó las 27 tablas de dominio", async () => {
    const rows = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public'`
    );
    const names = new Set(rows.map((r) => r.table_name as string));
    const faltantes = EXPECTED.filter((t) => !names.has(t));
    expect(faltantes).toEqual([]);
  });

  it("rechaza un material sin archivo ni link externo", async () => {
    await expect(
      db.execute(sql`
        insert into session_materials (class_session_id, title)
        values (gen_random_uuid(), 'huérfano')
      `)
    ).rejects.toThrow();
  });

  it("impide dos inscripciones del mismo alumno al mismo curso", async () => {
    const rows = await db.execute(sql`
      select 1 from pg_indexes
      where tablename = 'enrollments' and indexname = 'enrollments_user_course_uq'
    `);
    expect(rows.length).toBe(1);
  });

  it("el índice de nº de operación es parcial", async () => {
    const rows = await db.execute(sql`
      select indexdef from pg_indexes
      where indexname = 'payment_proofs_operation_uq'
    `);
    expect(String(rows[0].indexdef)).toContain("WHERE");
  });
});
