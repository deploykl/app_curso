import { pgEnum, pgTable, text, integer, timestamp, boolean, numeric, uuid, unique } from "drizzle-orm/pg-core";
import { courses } from "./catalog";
import { enrollments } from "./enrollment";

export const questionType = pgEnum("question_type", ["mcq", "true_false"]);
export const attemptStatus = pgEnum("attempt_status", ["in_progress", "submitted", "abandoned"]);

export const exams = pgTable("exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().unique().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  passingScore: integer("passing_score").notNull().default(70),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lockoutHours: integer("lockout_hours").notNull().default(24),
  timeLimitMinutes: integer("time_limit_minutes"),
  questionsPerAttempt: integer("questions_per_attempt"),
  shuffleQuestions: boolean("shuffle_questions").notNull().default(true),
  shuffleOptions: boolean("shuffle_options").notNull().default(true),
  isPublished: boolean("is_published").notNull().default(false),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  examId: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
  type: questionType("type").notNull(),
  promptMd: text("prompt_md").notNull(),
  explanationMd: text("explanation_md"),
  points: integer("points").notNull().default(1),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const questionOptions = pgTable("question_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
  orderIndex: integer("order_index").notNull().default(0),
});

export const examAttempts = pgTable("exam_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  enrollmentId: uuid("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  score: numeric("score", { precision: 5, scale: 2 }),
  passed: boolean("passed"),
  status: attemptStatus("status").notNull().default("in_progress"),
}, (t) => [unique("attempt_number_uq").on(t.enrollmentId, t.attemptNumber)]);

export const examAttemptQuestions = pgTable("exam_attempt_questions", {
  attemptId: uuid("attempt_id").notNull().references(() => examAttempts.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => questions.id),
  orderIndex: integer("order_index").notNull(),
}, (t) => [unique("attempt_question_uq").on(t.attemptId, t.questionId)]);

export const examAttemptAnswers = pgTable("exam_attempt_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: uuid("attempt_id").notNull().references(() => examAttempts.id, { onDelete: "cascade" }),
  questionId: uuid("question_id").notNull().references(() => questions.id),
  selectedOptionId: uuid("selected_option_id").references(() => questionOptions.id),
  isCorrect: boolean("is_correct").notNull().default(false),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("attempt_answer_uq").on(t.attemptId, t.questionId)]);
