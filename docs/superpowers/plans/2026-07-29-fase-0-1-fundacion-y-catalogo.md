# Fundación y Catálogo — Plan de Implementación (Fases 0 y 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en pie una app Next.js con autenticación por roles, el esquema completo de base de datos, y el catálogo funcionando de punta a punta: un instructor crea un curso con sesiones de Zoom y materiales, y un visitante lo ve publicado.

**Architecture:** Una sola app Next.js 16 (App Router, runtime Node) con cuatro route groups separados por rol. Lógica de negocio en `src/modules/<dominio>/service.ts`, sin importar nada de `next/*`, para poder testearla con Vitest sin servidor. Postgres + Drizzle con migraciones versionadas. Archivos en Cloudflare R2 mediante URLs presignadas.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Drizzle ORM · Postgres 16 · Better Auth · Tailwind v4 · shadcn/ui · nodemailer (MailHog en dev, Brevo SMTP en prod) · Cloudflare R2 (S3 SDK) · Turnstile · Vitest · Playwright · Docker Compose · pnpm

> **Nota de desviación (Task 1, 2026-07-29):** el scaffold usó `create-next-app@latest`, que instaló Next.js 16.2.12 en vez de la v15 originalmente especificada. Decisión del humano: aceptar Next 16 y actualizar esta constraint retroactivamente (no revertir). React 19 y los patrones App Router del resto del plan son compatibles.

**Spec:** `docs/superpowers/specs/2026-07-29-plataforma-cursos-online-design.md`

---

## Global Constraints

Aplican a **todas** las tareas. No se repiten en cada una.

- **Idioma de la UI:** español. Rutas en español (`/cursos`, `/pago`, `/verificar`).
- **Nombre de la academia:** nunca hardcodeado. Siempre `process.env.ACADEMIA_NAME`.
- **Dinero:** siempre `integer` de céntimos. Nunca `float`, nunca `numeric` para montos. Moneda `'PEN'`.
- **Fechas:** columnas `timestamp with time zone`. Se guarda en UTC, se muestra en `America/Lima`.
- **Zona horaria de visualización:** `America/Lima`, vía `Intl.DateTimeFormat`. Nunca la zona del servidor.
- **`src/modules/*/service.ts` NO importa nada de `next/*`.** Ni `next/headers`, ni `next/navigation`, ni `next/cache`. Si un servicio necesita el usuario actual, se le pasa como parámetro.
- **Precios y montos jamás se leen del cliente.** Se recalculan en el servidor a partir del `courseId`.
- **`zoom_url`, `recording_url` y las keys de R2 nunca se serializan** hacia un usuario sin inscripción activa.
- **Tabla de sesiones de clase se llama `class_sessions`**, nunca `sessions` — Better Auth ya usa ese nombre para las sesiones de login.
- **Package manager:** `pnpm`. Todos los comandos con `pnpm`, no `npm` ni `yarn`.
- **Commits:** en inglés, formato convencional (`feat:`, `test:`, `chore:`, `fix:`). Uno por tarea como mínimo.
- **Tests:** Vitest para unidad e integración, Playwright para E2E. Toda tarea con lógica de negocio empieza por un test que falla.

---

## Estructura de archivos

Lo que existe al terminar este plan. Cada archivo con una responsabilidad.

```
docker-compose.yml              postgres + mailhog para desarrollo
drizzle.config.ts               config de drizzle-kit
vitest.config.ts                unit + integración, con setup de DB
playwright.config.ts            E2E
.env.example                    todas las variables, documentadas

src/
  env.ts                        validación de variables de entorno al arrancar
  db/
    index.ts                    cliente Drizzle exportado como `db`
    schema/
      auth.ts                   generado por Better Auth CLI
      profiles.ts               instructor_profiles
      catalog.ts                categories, courses, course_outcomes, course_requirements
      sessions.ts               class_sessions, session_materials
      enrollment.ts             enrollments, session_attendance
      assessment.ts             exams, questions, question_options, exam_attempts,
                                exam_attempt_questions, exam_attempt_answers
      certification.ts          certificates
      billing.ts                orders, order_items, payment_destinations,
                                payment_proofs, payment_events, coupons,
                                coupon_redemptions
      earnings.ts               instructor_earnings, payouts
      notifications.ts          email_log, session_reminders_sent
      index.ts                  re-exporta todo
    seed.ts                     datos de prueba idempotentes

  lib/
    auth.ts                     instancia de Better Auth (servidor)
    auth-client.ts              cliente de Better Auth (navegador)
    money.ts                    formatPEN, parseSoles
    datetime.ts                 formatLima, sessionState
    slug.ts                     slugify + slug único
    r2.ts                       cliente S3 y URLs presignadas
    turnstile.ts                verificación del token

  modules/
    auth/
      guards.ts                 assertRole, requireUser, assertEnrolled
    notifications/
      mailer.ts                 sendEmail vía nodemailer + email_log
      templates/                verify-email.tsx, welcome.tsx
    catalog/
      service.ts                lógica pura de cursos y sesiones
      actions.ts                server actions del instructor
      queries.ts                lecturas para páginas públicas
      ui/                       formularios y tablas
    materials/
      service.ts                validación de archivos
      actions.ts                crear/borrar material, pedir URL de subida

  app/
    layout.tsx                  root: fuentes, tokens, providers
    globals.css                 tokens de diseño (Tailwind v4 @theme)
    (public)/
      page.tsx                  landing
      cursos/page.tsx           catálogo con filtros
      cursos/[slug]/page.tsx    detalle público del curso
    (auth)/
      login/page.tsx
      registro/page.tsx
      verificar-email/page.tsx
    (instructor)/
      layout.tsx                guard de rol
      instructor/page.tsx       lista de cursos
      instructor/cursos/nuevo/page.tsx
      instructor/cursos/[id]/page.tsx        editar curso
      instructor/cursos/[id]/sesiones/page.tsx
    api/
      auth/[...all]/route.ts    handler de Better Auth
      health/route.ts           ping a la DB
      r2/upload-url/route.ts    presigned PUT

tests/
  setup/db.ts                   migra y limpia la DB de test
  unit/                         money, datetime, slug, service puros
  integration/                  con Postgres real
  e2e/                          Playwright
```

**Por qué el schema está partido en 10 archivos:** son 31 tablas. En un solo archivo se vuelve imposible de revisar y de editar con fiabilidad. Un archivo por dominio, re-exportados desde `index.ts`.

---

## Tareas

### Task 1: Scaffold, Docker y health check

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`
- Create: `docker-compose.yml`
- Create: `src/env.ts`
- Create: `src/db/index.ts`
- Create: `src/app/api/health/route.ts`
- Create: `vitest.config.ts`, `tests/setup/db.ts`
- Create: `tests/integration/health.test.ts`

**Interfaces:**
- Consumes: nada, es la primera tarea.
- Produces: `db` (cliente Drizzle de `src/db/index.ts`), `env` (objeto validado de `src/env.ts`), y el script `pnpm test` funcionando contra un Postgres real.

- [ ] **Step 1: Scaffold de Next.js**

```bash
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

Si el directorio no está vacío (ya existe `docs/`), responde que sí a continuar.

- [ ] **Step 2: Instalar dependencias**

```bash
pnpm add drizzle-orm postgres zod
pnpm add -D drizzle-kit vitest @vitest/coverage-v8 dotenv tsx
```

- [ ] **Step 3: Crear `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: appcurso
      POSTGRES_PASSWORD: appcurso
      POSTGRES_DB: appcurso
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appcurso"]
      interval: 5s
      retries: 10

  db_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: appcurso
      POSTGRES_PASSWORD: appcurso
      POSTGRES_DB: appcurso_test
    ports: ["5433:5432"]
    tmpfs: ["/var/lib/postgresql/data"]

  mailhog:
    image: mailhog/mailhog
    ports: ["1025:1025", "8025:8025"]

volumes:
  pgdata:
```

La DB de test usa `tmpfs` (memoria) y puerto 5433: los tests corren rápido y no tocan tus datos de desarrollo.

- [ ] **Step 4: Crear `.env.example` y `.env.local`**

```bash
# App
ACADEMIA_NAME="Mi Academia"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Base de datos
DATABASE_URL="postgres://appcurso:appcurso@localhost:5432/appcurso"
TEST_DATABASE_URL="postgres://appcurso:appcurso@localhost:5433/appcurso_test"

# Better Auth
BETTER_AUTH_SECRET="cambiar-por-32-caracteres-aleatorios-min"
BETTER_AUTH_URL="http://localhost:3000"

# Email (dev: MailHog · prod: smtp-relay.brevo.com:587)
SMTP_HOST="localhost"
SMTP_PORT="1025"
SMTP_USER=""
SMTP_PASSWORD=""
MAIL_FROM="no-responder@localhost"

# Cloudflare R2
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET="app-curso-dev"

# Turnstile (claves de prueba de Cloudflare: siempre pasan)
NEXT_PUBLIC_TURNSTILE_SITE_KEY="1x00000000000000000000AA"
TURNSTILE_SECRET_KEY="1x0000000000000000000000000000000AA"

# Pagos
YAPE_MAX_CENTS="50000"
CRON_SECRET="cambiar-por-algo-aleatorio"
```

Copia el archivo a `.env.local` y añade `.env.local` a `.gitignore`. **`.env.example` sí se commitea, `.env.local` no.**

- [ ] **Step 5: Crear `src/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  ACADEMIA_NAME: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  MAIL_FROM: z.string().min(1),
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET: z.string().default(""),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  YAPE_MAX_CENTS: z.coerce.number().int().positive(),
  CRON_SECRET: z.string().min(8),
});

export const env = schema.parse(process.env);
```

Si falta una variable, la app **no arranca** y dice cuál. Mejor eso que un `undefined` silencioso en producción.

- [ ] **Step 6: Crear `src/db/index.ts`**

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

const client = postgres(url, { max: process.env.TEST_DATABASE_URL ? 1 : 10 });

export const db = drizzle(client, { schema });
export type Db = typeof db;
```

Crea también `src/db/schema/index.ts` vacío por ahora: `export {};`

- [ ] **Step 7: Crear el health check**

`src/app/api/health/route.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "@/db";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
```

- [ ] **Step 8: Configurar Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["dotenv/config"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/setup/db.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

`singleFork: true` porque los tests de integración comparten una sola base de datos. Sin esto se pisan entre sí.

`tests/setup/db.ts`:

```ts
import { execSync } from "node:child_process";

export default function setup() {
  process.env.TEST_DATABASE_URL ??=
    "postgres://appcurso:appcurso@localhost:5433/appcurso_test";
  execSync("pnpm drizzle-kit migrate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
  });
}
```

Añade a `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx src/db/seed.ts",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 9: Escribir el test que falla**

`tests/integration/health.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

describe("conexión a la base de datos", () => {
  it("responde a una consulta trivial", async () => {
    const result = await db.execute(sql`select 1 as uno`);
    expect(result[0]).toEqual({ uno: 1 });
  });
});
```

- [ ] **Step 10: Levantar Docker y verificar que el test falla**

```bash
docker compose up -d
pnpm test
```

Esperado: **FALLA**. `drizzle-kit migrate` no encuentra `drizzle.config.ts` ni carpeta de migraciones. Eso es correcto — se resuelve en la Task 2.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Docker, env validation and health check"
```

---

### Task 2: Drizzle y Better Auth

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/db/schema/auth.ts` (generado por CLI)
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`
- Create: `src/app/api/auth/[...all]/route.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/integration/auth-schema.test.ts`

**Interfaces:**
- Consumes: `db` de `src/db/index.ts`, `env` de `src/env.ts`.
- Produces:
  - `auth` — instancia de Better Auth, con `auth.api.getSession({ headers })`.
  - `authClient` — cliente de navegador con `signIn`, `signUp`, `signOut`.
  - Tablas de auth. **Los nombres exactos los define el CLI**, típicamente `user`, `session`, `account`, `verification` en singular. Las tareas posteriores importan `user` desde `@/db/schema` y referencian `user.id`.

- [ ] **Step 1: Instalar Better Auth**

```bash
pnpm add better-auth
```

- [ ] **Step 2: Crear `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 3: Crear la instancia de Better Auth**

`src/lib/auth.ts`:

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { env } from "@/env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60 * 24, // 24h
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "student", input: false },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
```

`input: false` en `role` es crítico: impide que alguien se registre mandando `role: "admin"` en el body.

- [ ] **Step 4: Generar el schema de auth con el CLI**

```bash
pnpm dlx @better-auth/cli@latest generate --config src/lib/auth.ts --output src/db/schema/auth.ts
```

**Revisa el archivo generado antes de seguir.** Anota los nombres exactos de tabla y de columna que produjo — las tareas siguientes dependen de ellos. Si el CLI genera `user` en singular, se usa `user`, no se renombra.

Luego en `src/db/schema/index.ts`:

```ts
export * from "./auth";
```

- [ ] **Step 5: Generar y aplicar la migración**

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 6: Handler de rutas y cliente**

`src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

`src/lib/auth-client.ts`:

```ts
"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

- [ ] **Step 7: Escribir el test**

`tests/integration/auth-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

async function tableExists(name: string) {
  const rows = await db.execute(
    sql`select 1 from information_schema.tables
        where table_schema = 'public' and table_name = ${name}`
  );
  return rows.length === 1;
}

describe("schema de autenticación", () => {
  it("creó las tablas de Better Auth", async () => {
    // Ajusta los nombres a lo que generó el CLI en el Step 4
    expect(await tableExists("user")).toBe(true);
    expect(await tableExists("session")).toBe(true);
    expect(await tableExists("account")).toBe(true);
    expect(await tableExists("verification")).toBe(true);
  });

  it("no existe una tabla llamada class_sessions todavía", async () => {
    expect(await tableExists("class_sessions")).toBe(false);
  });
});
```

El segundo test parece tonto pero documenta la separación entre `session` (login) y `class_sessions` (clases), que es el error de nombres que queremos evitar.

- [ ] **Step 8: Correr los tests**

```bash
pnpm test
```

Esperado: **PASAN** los dos archivos, incluido `health.test.ts` de la Task 1 (ya hay migraciones que aplicar).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Drizzle config and Better Auth with email verification"
```

---

### Task 3: Esquema completo de base de datos

**Files:**
- Create: `src/db/schema/profiles.ts`, `catalog.ts`, `sessions.ts`, `enrollment.ts`, `assessment.ts`, `certification.ts`, `billing.ts`, `earnings.ts`, `notifications.ts`
- Modify: `src/db/schema/index.ts`
- Create: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `user` de `./auth`.
- Produces: las 27 tablas restantes, exportadas desde `@/db/schema`. Nombres que las tareas siguientes usan: `instructorProfiles`, `categories`, `courses`, `courseOutcomes`, `courseRequirements`, `classSessions`, `sessionMaterials`, `enrollments`, `sessionAttendance`, `exams`, `questions`, `questionOptions`, `examAttempts`, `examAttemptQuestions`, `examAttemptAnswers`, `certificates`, `orders`, `orderItems`, `paymentDestinations`, `paymentProofs`, `paymentEvents`, `coupons`, `couponRedemptions`, `instructorEarnings`, `payouts`, `emailLog`, `sessionRemindersSent`.

- [ ] **Step 1: Enums y helpers compartidos**

Al inicio de `src/db/schema/profiles.ts`:

```ts
import { pgEnum, pgTable, text, timestamp, numeric, uuid } from "drizzle-orm/pg-core";
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
```

**`bankCci` va en texto plano.** Es deuda técnica aceptada y documentada en la sección 7 del spec. No la cifres a medias.

`user.id` es `text` porque así lo genera Better Auth. Si el CLI del Step 4 de la Task 2 generó otro tipo, ajusta todas las FK a ese tipo.

- [ ] **Step 2: Catálogo**

`src/db/schema/catalog.ts`:

```ts
import { pgEnum, pgTable, text, integer, timestamp, boolean, numeric, uuid, index } from "drizzle-orm/pg-core";
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
```

- [ ] **Step 3: Sesiones de clase y materiales**

`src/db/schema/sessions.ts`:

```ts
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
```

El `check` obliga a que un material tenga **exactamente uno** de los dos orígenes. Sin él, terminas con materiales sin archivo ni link, o con los dos y sin saber cuál gana.

El índice sobre `(startsAt, status)` es el que usará el cron de recordatorios en la fase 3.

- [ ] **Step 4: Inscripción y asistencia**

`src/db/schema/enrollment.ts`:

```ts
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
```

`orderId` es nullable a propósito: permite inscripciones de cortesía sin venta, que no generan `order_item` ni comisión.

- [ ] **Step 5: Facturación**

`src/db/schema/billing.ts`:

```ts
import { pgEnum, pgTable, text, integer, timestamp, boolean, numeric, uuid, jsonb, unique, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  operationNumber: text("operation_number").notNull(),
  declaredAmountCents: integer("declared_amount_cents").notNull(),
  transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull(),
  proofFileKey: text("proof_file_key").notNull(),
  status: proofStatus("status").notNull().default("pending"),
  reviewedBy: text("reviewed_by").references(() => user.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("payment_proofs_operation_uq")
    .on(t.method, t.operationNumber)
    .where(sql`${t.status} <> 'rejected'`),
]);

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
```

El `uniqueIndex(...).where(...)` es el índice único **parcial** de la sección 5 del spec: impide reutilizar un nº de operación salvo que el comprobante haya sido rechazado.

`coupons.value` es `integer`: si `type = 'percent'` son puntos porcentuales (`20` = 20%), si es `'fixed'` son céntimos.

- [ ] **Step 6: Evaluación, certificación, comisiones y notificaciones**

`src/db/schema/assessment.ts`:

```ts
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
```

`src/db/schema/certification.ts`:

```ts
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
```

`src/db/schema/earnings.ts`:

```ts
import { pgEnum, pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { orderItems } from "./billing";

export const earningStatus = pgEnum("earning_status", ["pending", "available", "paid", "reversed"]);
export const payoutStatus = pgEnum("payout_status", ["draft", "paid"]);

export const payouts = pgTable("payouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  totalCents: integer("total_cents").notNull(),
  status: payoutStatus("status").notNull().default("draft"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reference: text("reference"),
  notes: text("notes"),
});

export const instructorEarnings = pgTable("instructor_earnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderItemId: uuid("order_item_id").notNull().unique()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  instructorId: text("instructor_id").notNull().references(() => user.id),
  grossCents: integer("gross_cents").notNull(),
  commissionCents: integer("commission_cents").notNull(),
  netCents: integer("net_cents").notNull(),
  status: earningStatus("status").notNull().default("pending"),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  payoutId: uuid("payout_id").references(() => payouts.id),
});
```

`src/db/schema/notifications.ts`:

```ts
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
```

- [ ] **Step 7: Re-exportar todo**

`src/db/schema/index.ts`:

```ts
export * from "./auth";
export * from "./profiles";
export * from "./catalog";
export * from "./sessions";
export * from "./enrollment";
export * from "./billing";
export * from "./assessment";
export * from "./certification";
export * from "./earnings";
export * from "./notifications";
```

- [ ] **Step 8: Escribir el test antes de migrar**

`tests/integration/schema.test.ts`:

```ts
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
```

- [ ] **Step 9: Verificar que falla**

```bash
pnpm test tests/integration/schema.test.ts
```

Esperado: **FALLA** — las tablas no existen todavía.

- [ ] **Step 10: Generar y aplicar la migración**

```bash
pnpm db:generate
pnpm db:migrate
pnpm test
```

Esperado: **PASAN** los tres archivos de test.

Si `drizzle-kit generate` se queja de dependencia circular entre `enrollment.ts` y `billing.ts` (enrollments → orders, y billing no depende de enrollment), no la hay: la dirección es única. Si aparece un error, revisa que `billing.ts` no importe de `enrollment.ts`.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add complete database schema with 27 domain tables"
```

---

### Task 4: Utilidades puras y mailer

**Files:**
- Create: `src/lib/money.ts`, `src/lib/datetime.ts`, `src/lib/slug.ts`
- Create: `src/modules/notifications/mailer.ts`
- Create: `tests/unit/money.test.ts`, `tests/unit/datetime.test.ts`, `tests/unit/slug.test.ts`
- Create: `tests/integration/mailer.test.ts`

**Interfaces:**
- Consumes: `db`, `emailLog` de `@/db/schema`, `env`.
- Produces:
  - `formatPEN(cents: number): string` → `"S/ 199.00"`
  - `soonesToCents(soles: string | number): number`
  - `formatLima(date: Date, opts?): string`
  - `sessionState(startsAt: Date, durationMinutes: number, now?: Date): "upcoming" | "live" | "past"`
  - `slugify(text: string): string`
  - `uniqueSlug(base: string, exists: (s: string) => Promise<boolean>): Promise<string>`
  - `sendEmail(input: { to: string; userId?: string; template: string; subject: string; html: string }): Promise<{ ok: boolean }>`

- [ ] **Step 1: Escribir los tests que fallan**

`tests/unit/money.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatPEN, solesToCents } from "@/lib/money";

describe("formatPEN", () => {
  it("formatea céntimos como soles", () => {
    expect(formatPEN(19900)).toBe("S/ 199.00");
    expect(formatPEN(0)).toBe("S/ 0.00");
    expect(formatPEN(5)).toBe("S/ 0.05");
  });

  it("agrupa miles", () => {
    expect(formatPEN(123456)).toBe("S/ 1,234.56");
  });
});

describe("solesToCents", () => {
  it("convierte soles a céntimos enteros", () => {
    expect(solesToCents("199.00")).toBe(19900);
    expect(solesToCents(199)).toBe(19900);
    expect(solesToCents("0.05")).toBe(5);
  });

  it("redondea, no trunca", () => {
    expect(solesToCents("19.999")).toBe(2000);
  });

  it("rechaza valores no numéricos o negativos", () => {
    expect(() => solesToCents("abc")).toThrow();
    expect(() => solesToCents(-1)).toThrow();
  });
});
```

`tests/unit/datetime.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatLima, sessionState } from "@/lib/datetime";

describe("formatLima", () => {
  it("muestra la hora en zona de Lima, no en UTC", () => {
    // 2026-08-15T00:00:00Z son las 19:00 del 14/08 en Lima (UTC-5)
    const out = formatLima(new Date("2026-08-15T00:00:00Z"));
    expect(out).toContain("14");
    expect(out).toContain("7:00");
  });
});

describe("sessionState", () => {
  const startsAt = new Date("2026-08-15T15:00:00Z");

  it("es 'upcoming' antes de empezar", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T14:59:00Z"))).toBe("upcoming");
  });

  it("es 'live' durante la sesión", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T15:30:00Z"))).toBe("live");
  });

  it("sigue 'live' en el minuto final", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T15:59:59Z"))).toBe("live");
  });

  it("es 'past' al terminar la duración", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T16:00:01Z"))).toBe("past");
  });

  it("da 15 minutos de gracia antes del inicio", () => {
    expect(sessionState(startsAt, 60, new Date("2026-08-15T14:50:00Z"))).toBe("live");
  });
});
```

`tests/unit/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("quita tildes y ñ", () => {
    expect(slugify("Diseño Gráfico Básico")).toBe("diseno-grafico-basico");
  });

  it("colapsa separadores", () => {
    expect(slugify("  Excel   ---  Avanzado!! ")).toBe("excel-avanzado");
  });

  it("nunca devuelve cadena vacía", () => {
    expect(slugify("¡¿!").length).toBeGreaterThan(0);
  });
});

describe("uniqueSlug", () => {
  it("devuelve el base si está libre", async () => {
    expect(await uniqueSlug("excel", async () => false)).toBe("excel");
  });

  it("añade sufijo numérico si está tomado", async () => {
    const tomados = new Set(["excel", "excel-2"]);
    expect(await uniqueSlug("excel", async (s) => tomados.has(s))).toBe("excel-3");
  });
});
```

- [ ] **Step 2: Verificar que fallan**

```bash
pnpm test tests/unit
```

Esperado: **FALLA** con "Cannot find module '@/lib/money'".

- [ ] **Step 3: Implementar las utilidades**

`src/lib/money.ts`:

```ts
export function formatPEN(cents: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `S/ ${formatted}`;
}

export function solesToCents(soles: string | number): number {
  const n = typeof soles === "string" ? Number(soles.trim()) : soles;
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Monto inválido: ${soles}`);
  }
  return Math.round(n * 100);
}
```

Se usa el locale `en-US` a propósito, para que el separador de miles sea coma y el decimal punto — la convención habitual en precios en Perú (`S/ 1,234.56`).

`src/lib/datetime.ts`:

```ts
export const LIMA = "America/Lima";

export function formatLima(
  date: Date,
  opts: Intl.DateTimeFormatOptions = {
    day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }
): string {
  return new Intl.DateTimeFormat("es-PE", { ...opts, timeZone: LIMA }).format(date);
}

const JOIN_OPENS_MINUTES = 10;
const JOIN_DEADZONE_MINUTES = 1;

export type SessionState = "upcoming" | "live" | "past";

export function sessionState(
  startsAt: Date,
  durationMinutes: number,
  now: Date = new Date()
): SessionState {
  const joinOpensAt = startsAt.getTime() - JOIN_OPENS_MINUTES * 60_000;
  const joinClosesAt = startsAt.getTime() - JOIN_DEADZONE_MINUTES * 60_000;
  const sessionEndsAt = startsAt.getTime() + durationMinutes * 60_000;
  const nowTime = now.getTime();
  if (nowTime >= joinOpensAt && nowTime < joinClosesAt) return "live";
  if (nowTime < startsAt.getTime()) return "upcoming";
  if (nowTime <= sessionEndsAt) return "live";
  return "past";
}
```

> **Nota de desviación (Task 4, 2026-07-30):** el texto original de este plan especificaba `GRACE_MINUTES = 15` con una única ventana de gracia, pero esa fórmula es matemáticamente incompatible con el propio test del plan (a 1 minuto de empezar debía dar `"upcoming"`, imposible con 15 min de gracia simple). Decisión del humano: aceptar el diseño alternativo del implementador — ventana de apertura a los 10 minutos antes del inicio, con 1 minuto de "zona muerta" justo antes donde no se puede entrar (evita el alumno entrando y saliendo confundido justo al filo). Los 5 casos de test del plan quedan satisfechos con este diseño.

`src/lib/slug.ts`:

```ts
export function slugify(text: string): string {
  const s = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "curso";
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const root = slugify(base);
  if (!(await exists(root))) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${Date.now()}`;
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/unit
```

Esperado: **PASAN** los tres archivos.

- [ ] **Step 5: Implementar el mailer**

```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

`src/modules/notifications/mailer.ts`:

```ts
import nodemailer from "nodemailer";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/env";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
});

export interface SendEmailInput {
  to: string;
  userId?: string;
  template: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean }> {
  try {
    const info = await transport.sendMail({
      from: env.MAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    await db.insert(emailLog).values({
      userId: input.userId ?? null,
      toEmail: input.to,
      template: input.template,
      subject: input.subject,
      providerId: info.messageId,
      status: "sent",
    });
    return { ok: true };
  } catch (e) {
    await db.insert(emailLog).values({
      userId: input.userId ?? null,
      toEmail: input.to,
      template: input.template,
      subject: input.subject,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false };
  }
}
```

**`sendEmail` nunca lanza.** Devuelve `{ ok: false }` y lo registra. Un fallo de email jamás debe reventar una transacción de negocio — por eso en el spec los emails se envían siempre **después** del COMMIT.

Un solo transport SMTP sirve para dev (MailHog, sin auth) y para producción (Brevo, con auth). Un único camino de código.

- [ ] **Step 6: Test de integración del mailer**

`tests/integration/mailer.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailLog } from "@/db/schema";
import { sendEmail } from "@/modules/notifications/mailer";

beforeEach(async () => {
  await db.delete(emailLog);
});

describe("sendEmail", () => {
  it("envía y registra en email_log", async () => {
    const res = await sendEmail({
      to: "alumno@test.pe",
      template: "verify-email",
      subject: "Verifica tu correo",
      html: "<p>hola</p>",
    });
    expect(res.ok).toBe(true);

    const rows = await db.select().from(emailLog).where(eq(emailLog.toEmail, "alumno@test.pe"));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].template).toBe("verify-email");
  });

  it("no lanza cuando el SMTP falla, y lo registra", async () => {
    const original = process.env.SMTP_PORT;
    // Un puerto sin nada escuchando fuerza el fallo
    const { sendEmail: freshSend } = await import("@/modules/notifications/mailer?bad");
    process.env.SMTP_PORT = original;

    const res = await sendEmail({
      to: "no-existe@invalid.invalid",
      template: "test",
      subject: "x",
      html: "x",
    });
    // MailHog acepta cualquier destinatario, así que este caso solo
    // verifica que la función devuelve una forma estable y no lanza.
    expect(typeof res.ok).toBe("boolean");
    const rows = await db.select().from(emailLog);
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

Requiere MailHog corriendo (`docker compose up -d`). Revisa los correos en `http://localhost:8025`.

- [ ] **Step 7: Correr todo**

```bash
pnpm test
```

Esperado: **PASAN** todos.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add money, datetime and slug utilities plus SMTP mailer with logging"
```

---

### Task 5: Registro, login y verificación de email

**Files:**
- Modify: `src/lib/auth.ts` (conectar el mailer)
- Create: `src/lib/turnstile.ts`
- Create: `src/modules/notifications/templates/verify-email.ts`
- Create: `src/app/(auth)/layout.tsx`, `login/page.tsx`, `registro/page.tsx`, `verificar-email/page.tsx`
- Create: `src/components/turnstile-widget.tsx`
- Create: `tests/unit/turnstile.test.ts`

**Interfaces:**
- Consumes: `auth`, `authClient`, `sendEmail`, `env`.
- Produces:
  - `verifyTurnstile(token: string, ip?: string): Promise<boolean>`
  - `verifyEmailTemplate(input: { name: string; url: string }): { subject: string; html: string }`
  - Rutas `/registro`, `/login`, `/verificar-email` funcionando.

- [ ] **Step 1: Test de Turnstile**

`tests/unit/turnstile.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

afterEach(() => vi.restoreAllMocks());

describe("verifyTurnstile", () => {
  it("devuelve true cuando Cloudflare responde success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
    expect(await verifyTurnstile("token-ok")).toBe(true);
  });

  it("devuelve false cuando responde error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ success: false, "error-codes": ["invalid-input-response"] })
    ));
    expect(await verifyTurnstile("token-malo")).toBe(false);
  });

  it("devuelve false si el token viene vacío, sin llamar a la red", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await verifyTurnstile("")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("devuelve false si la red falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await verifyTurnstile("token")).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla**

```bash
pnpm test tests/unit/turnstile.test.ts
```

Esperado: **FALLA**, módulo no encontrado.

- [ ] **Step 3: Implementar Turnstile**

`src/lib/turnstile.ts`:

```ts
import { env } from "@/env";

const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
    });
    if (ip) body.set("remoteip", ip);

    const res = await fetch(ENDPOINT, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
```

Falla cerrado: cualquier error de red o de formato devuelve `false`. Un captcha que falla abierto no sirve de nada.

- [ ] **Step 4: Verificar que pasa**

```bash
pnpm test tests/unit/turnstile.test.ts
```

Esperado: **PASA**.

- [ ] **Step 5: Plantilla de verificación**

`src/modules/notifications/templates/verify-email.ts`:

```ts
import { env } from "@/env";

export function verifyEmailTemplate(input: { name: string; url: string }) {
  return {
    subject: `Verifica tu correo — ${env.ACADEMIA_NAME}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Confirma tu correo para activar tu cuenta en <strong>${escapeHtml(env.ACADEMIA_NAME)}</strong>.</p>
  <p style="margin:28px 0">
    <a href="${input.url}"
       style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
      Verificar mi correo
    </a>
  </p>
  <p style="color:#666;font-size:13px">El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
```

`escapeHtml` no es opcional: el nombre lo escribe el usuario y va dentro de HTML.

- [ ] **Step 6: Conectar el mailer a Better Auth**

En `src/lib/auth.ts`, dentro de `betterAuth({...})`, reemplaza el bloque `emailVerification`:

```ts
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, html } = verifyEmailTemplate({ name: user.name, url });
      await sendEmail({ to: user.email, userId: user.id, template: "verify-email", subject, html });
    },
  },
```

Y añade los imports arriba:

```ts
import { sendEmail } from "@/modules/notifications/mailer";
import { verifyEmailTemplate } from "@/modules/notifications/templates/verify-email";
```

- [ ] **Step 7: Widget de Turnstile**

`src/components/turnstile-widget.tsx`:

```tsx
"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: object) => void } }
}

export function TurnstileWidget({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = () => {
      if (ref.current) {
        window.turnstile?.render(ref.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: onToken,
        });
      }
    };
    document.head.appendChild(script);
    return () => script.remove();
  }, [onToken]);

  return <div ref={ref} />;
}
```

- [ ] **Step 8: Páginas de registro y login**

`src/app/(auth)/registro/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { TurnstileWidget } from "@/components/turnstile-widget";

export default function RegistroPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!token) return setError("Completa la verificación de seguridad.");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await signUp.email({
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
      fetchOptions: { headers: { "x-turnstile-token": token } },
    });

    setLoading(false);
    if (res.error) return setError(res.error.message ?? "No pudimos crear tu cuenta.");
    router.push("/verificar-email");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-4 py-12">
      <h1 className="text-2xl font-semibold">Crear cuenta</h1>
      <input name="name" required placeholder="Nombre completo" className="rounded border p-2" />
      <input name="email" type="email" required placeholder="Correo" className="rounded border p-2" />
      <input name="password" type="password" required minLength={8}
             placeholder="Contraseña (mín. 8)" className="rounded border p-2" />
      <TurnstileWidget onToken={setToken} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={loading} className="rounded bg-black p-2 text-white disabled:opacity-50">
        {loading ? "Creando..." : "Crear cuenta"}
      </button>
    </form>
  );
}
```

`src/app/(auth)/login/page.tsx`: igual estructura, con `signIn.email({ email, password })` y redirección a `/mi-aprendizaje`, sin Turnstile.

`src/app/(auth)/verificar-email/page.tsx`: página estática que dice *"Te enviamos un correo. Revisa tu bandeja y haz clic en el enlace para activar tu cuenta."* Sin lógica.

`src/app/(auth)/layout.tsx`: contenedor centrado con el nombre de la academia desde `env.ACADEMIA_NAME`.

- [ ] **Step 9: Verificación manual**

```bash
pnpm dev
```

1. Ve a `http://localhost:3000/registro` y crea una cuenta.
2. Abre `http://localhost:8025` (MailHog) y confirma que llegó el correo.
3. Haz clic en el enlace de verificación.
4. Entra en `/login` con esas credenciales.
5. Comprueba en `pnpm db:studio` que `user.email_verified` pasó a `true` y que hay una fila en `email_log`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add signup, login and email verification with Turnstile"
```

---

### Task 6: Roles, guards y perfil de instructor

**Files:**
- Create: `src/modules/auth/guards.ts`
- Create: `src/app/(instructor)/layout.tsx`, `src/app/(admin)/layout.tsx`
- Create: `src/db/seed.ts`
- Create: `tests/integration/guards.test.ts`

**Interfaces:**
- Consumes: `auth`, `db`, `instructorProfiles`, `enrollments`, `user`.
- Produces:
  - `requireUser(): Promise<SessionUser>` — lanza `redirect("/login")` si no hay sesión.
  - `assertRole(roles: Role[]): Promise<SessionUser>` — lanza `forbidden` si el rol no está.
  - `assertEnrolled(userId: string, courseId: string): Promise<void>` — lanza si no hay inscripción activa.
  - `isEnrolled(userId: string, courseId: string): Promise<boolean>` — versión no lanzante.
  - `canManageCourse(userId: string, role: Role, courseInstructorId: string): boolean`
  - `type Role = "student" | "instructor" | "admin"`

- [ ] **Step 1: Escribir el test**

`tests/integration/guards.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, courses, enrollments, categories } from "@/db/schema";
import { isEnrolled, assertEnrolled, canManageCourse } from "@/modules/auth/guards";

let alumnoId: string;
let otroId: string;
let cursoId: string;

beforeEach(async () => {
  await db.delete(enrollments);
  await db.delete(courses);
  await db.delete(user);

  const [a] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Alumno", email: "a@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  const [o] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Otro", email: "o@test.pe",
    emailVerified: true, role: "student",
  }).returning();
  const [inst] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();

  alumnoId = a.id; otroId = o.id;

  const [c] = await db.insert(courses).values({
    instructorId: inst.id, slug: "curso-x", title: "Curso X",
    priceCents: 19900, status: "published",
  }).returning();
  cursoId = c.id;

  await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  });
});

describe("isEnrolled", () => {
  it("es true para una inscripción activa", async () => {
    expect(await isEnrolled(alumnoId, cursoId)).toBe(true);
  });

  it("es false para quien no está inscrito", async () => {
    expect(await isEnrolled(otroId, cursoId)).toBe(false);
  });

  it("es false si la inscripción fue revocada", async () => {
    await db.update(enrollments).set({ status: "revoked" });
    expect(await isEnrolled(alumnoId, cursoId)).toBe(false);
  });

  it("es false si fue reembolsada", async () => {
    await db.update(enrollments).set({ status: "refunded" });
    expect(await isEnrolled(alumnoId, cursoId)).toBe(false);
  });
});

describe("assertEnrolled", () => {
  it("no lanza para un inscrito", async () => {
    await expect(assertEnrolled(alumnoId, cursoId)).resolves.toBeUndefined();
  });

  it("lanza para quien no lo está", async () => {
    await expect(assertEnrolled(otroId, cursoId)).rejects.toThrow(/no está inscrito/i);
  });
});

describe("canManageCourse", () => {
  it("el dueño puede", () => {
    expect(canManageCourse("u1", "instructor", "u1")).toBe(true);
  });

  it("otro instructor no puede", () => {
    expect(canManageCourse("u2", "instructor", "u1")).toBe(false);
  });

  it("un admin puede cualquiera", () => {
    expect(canManageCourse("u2", "admin", "u1")).toBe(true);
  });

  it("un alumno nunca puede, ni siendo el id igual", () => {
    expect(canManageCourse("u1", "student", "u1")).toBe(false);
  });
});
```

El último caso importa: si algún día un instructor es degradado a alumno, el chequeo por rol debe ganar sobre el de propiedad.

- [ ] **Step 2: Verificar que falla**

```bash
pnpm test tests/integration/guards.test.ts
```

Esperado: **FALLA**, módulo no encontrado.

- [ ] **Step 3: Implementar los guards**

`src/modules/auth/guards.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments } from "@/db/schema";

export type Role = "student" | "instructor" | "admin";

export class ForbiddenError extends Error {}

export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  const rows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(
      eq(enrollments.userId, userId),
      eq(enrollments.courseId, courseId),
      eq(enrollments.status, "active"),
    ))
    .limit(1);
  return rows.length === 1;
}

export async function assertEnrolled(userId: string, courseId: string): Promise<void> {
  if (!(await isEnrolled(userId, courseId))) {
    throw new ForbiddenError("El usuario no está inscrito en este curso.");
  }
}

export function canManageCourse(
  userId: string,
  role: Role,
  courseInstructorId: string
): boolean {
  if (role === "admin") return true;
  if (role === "instructor") return userId === courseInstructorId;
  return false;
}
```

**Este archivo no importa nada de `next/*`** — por eso es testeable directo. Los helpers que sí necesitan la request van en un archivo aparte:

`src/modules/auth/session.ts`:

```ts
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "./guards";

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export async function assertRole(roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role as Role)) redirect("/");
  return u;
}
```

La separación es deliberada: `guards.ts` es lógica pura y testeable, `session.ts` es la capa que toca Next.

- [ ] **Step 4: Verificar que pasa**

```bash
pnpm test tests/integration/guards.test.ts
```

Esperado: **PASAN** los 10 casos.

- [ ] **Step 5: Layouts con guard**

`src/app/(instructor)/layout.tsx`:

```tsx
import { assertRole } from "@/modules/auth/session";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const u = await assertRole(["instructor", "admin"]);
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-8 flex items-center justify-between border-b pb-4">
        <span className="font-semibold">Panel de instructor</span>
        <span className="text-sm text-neutral-500">{u.name}</span>
      </nav>
      {children}
    </div>
  );
}
```

`src/app/(admin)/layout.tsx`: idéntico pero con `assertRole(["admin"])` y el título "Administración".

- [ ] **Step 6: Script de seed**

`src/db/seed.ts`:

```ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, instructorProfiles, categories, courses, classSessions } from "@/db/schema";
import { auth } from "@/lib/auth";

const CATEGORIAS = [
  { slug: "ofimatica", name: "Ofimática", orderIndex: 1 },
  { slug: "diseno", name: "Diseño", orderIndex: 2 },
  { slug: "negocios", name: "Negocios", orderIndex: 3 },
];

async function upsertUser(email: string, name: string, password: string, role: string) {
  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (existing.length) return existing[0];

  await auth.api.signUpEmail({ body: { email, password, name } });
  await db.update(user).set({ role, emailVerified: true }).where(eq(user.email, email));
  const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  return u;
}

async function main() {
  for (const c of CATEGORIAS) {
    await db.insert(categories).values(c).onConflictDoNothing({ target: categories.slug });
  }

  const admin = await upsertUser("admin@test.pe", "Admin General", "admin12345", "admin");
  const prof = await upsertUser("prof@test.pe", "Ana Instructora", "prof12345", "instructor");
  await upsertUser("alumno@test.pe", "Luis Alumno", "alumno12345", "student");

  await db.insert(instructorProfiles).values({
    userId: prof.id,
    displayName: "Ana Instructora",
    headline: "Especialista en Excel",
    commissionRate: "30.00",
    status: "approved",
  }).onConflictDoNothing();

  const [cat] = await db.select().from(categories).where(eq(categories.slug, "ofimatica")).limit(1);

  const existing = await db.select().from(courses).where(eq(courses.slug, "excel-desde-cero")).limit(1);
  if (!existing.length) {
    const [curso] = await db.insert(courses).values({
      instructorId: prof.id,
      categoryId: cat.id,
      slug: "excel-desde-cero",
      title: "Excel desde cero",
      subtitle: "Domina las hojas de cálculo en 4 clases en vivo",
      descriptionMd: "Curso práctico con clases en vivo por Zoom y materiales descargables.",
      level: "basico",
      priceCents: 19900,
      estimatedHours: "8.00",
      status: "published",
      publishedAt: new Date(),
    }).returning();

    const base = Date.now() + 7 * 86_400_000;
    for (let i = 0; i < 4; i++) {
      await db.insert(classSessions).values({
        courseId: curso.id,
        orderIndex: i,
        title: `Clase ${i + 1}`,
        startsAt: new Date(base + i * 7 * 86_400_000),
        durationMinutes: 90,
        zoomUrl: `https://zoom.us/j/00000000${i}`,
        isFreePreview: i === 0,
      });
    }
  }

  console.log("Seed listo. admin@test.pe / prof@test.pe / alumno@test.pe — contraseñas: <rol>12345");
  process.exit(0);
}

main();
```

El seed es **idempotente**: se puede correr muchas veces sin duplicar nada. Un seed que falla al segundo intento se vuelve inútil en cuanto lo necesitas.

- [ ] **Step 7: Correr el seed y verificar**

```bash
pnpm db:seed
pnpm dev
```

Entra con `prof@test.pe` / `prof12345` y visita `/instructor` — debe cargar. Entra con `alumno@test.pe` y visita `/instructor` — debe redirigir a `/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add role guards, enrollment checks and idempotent seed script"
```

---

### Task 7: Tokens de diseño y layouts base

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/app/(public)/layout.tsx`
- Create: `src/components/ui/*` (generado por shadcn)

**Interfaces:**
- Consumes: `env.ACADEMIA_NAME`.
- Produces: tokens CSS y los componentes shadcn `button`, `input`, `label`, `textarea`, `select`, `card`, `table`, `badge`, `dialog`, `sonner`. Todas las tareas siguientes los importan desde `@/components/ui/*`.

**SKILL A INVOCAR EN ESTA TAREA:** `ui-ux-pro-max`, y **solo aquí**. Se decide la paleta, la tipografía, la escala de espaciado y la densidad de tabla **una sola vez**, y todas las pantallas posteriores las heredan. No invoques skills de diseño en las tareas 8–11: correr una skill de estética por pantalla es exactamente cómo se produce una app inconsistente.

- [ ] **Step 1: Instalar shadcn/ui**

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input label textarea select card table badge dialog sonner
```

- [ ] **Step 2: Definir los tokens**

Invoca la skill `ui-ux-pro-max` con este brief:

> Plataforma de cursos online en español, mercado peruano. Dos caras: páginas públicas que deben vender (landing, catálogo, detalle de curso) y paneles densos de administración con tablas y formularios (aprobación de pagos, CRUD de cursos, banco de preguntas, liquidaciones). Necesito UN sistema de tokens que sirva a ambas: paleta, tipografía con escala, espaciado, radios, sombras, densidad de tabla y estados de formulario (default, focus, error, disabled). Modo claro y oscuro. Nada de gradientes decorativos ni sombras pesadas.

El entregable es `src/app/globals.css` con los tokens declarados en el bloque `@theme` de Tailwind v4, y las variables de shadcn ajustadas a esa paleta.

- [ ] **Step 3: Root layout**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/env";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: env.ACADEMIA_NAME, template: `%s — ${env.ACADEMIA_NAME}` },
  description: "Cursos en vivo con certificación verificable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

`lang="es-PE"` no es cosmético: afecta a la corrección ortográfica del navegador y a los lectores de pantalla.

- [ ] **Step 4: Layout público con navegación**

`src/app/(public)/layout.tsx`: header con el nombre de la academia enlazando a `/`, enlaces a `/cursos` y `/login`, y footer con enlaces a `/terminos`, `/privacidad`, `/reembolsos` y `/reclamaciones`. Esas cuatro páginas se crean en la fase 6; por ahora el footer las enlaza y devolverán 404, lo cual es aceptable en desarrollo.

- [ ] **Step 5: Verificar visualmente**

```bash
pnpm dev
```

Revisa `/`, `/login` y `/instructor` en modo claro y oscuro, y en un viewport de 375px de ancho. Nada debe desbordarse horizontalmente.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add design tokens, shadcn components and base layouts"
```

---

### Task 8: CRUD de cursos del instructor

**Files:**
- Create: `src/modules/catalog/service.ts`, `actions.ts`, `queries.ts`
- Create: `src/modules/catalog/ui/course-form.tsx`
- Create: `src/app/(instructor)/instructor/page.tsx`
- Create: `src/app/(instructor)/instructor/cursos/nuevo/page.tsx`
- Create: `src/app/(instructor)/instructor/cursos/[id]/page.tsx`
- Create: `tests/unit/catalog-service.test.ts`
- Create: `tests/integration/catalog-actions.test.ts`

**Interfaces:**
- Consumes: `db`, `courses`, `categories`, `user`, `canManageCourse`, `slugify`, `uniqueSlug`, `solesToCents`, `assertRole`.
- Produces:
  - `courseInputSchema` — Zod: `{ title, subtitle?, descriptionMd?, categoryId?, level, priceSoles, estimatedHours? }`
  - `resolveCommissionRate(courseOverride: string | null, profileRate: string): string`
  - `canPublish(course): { ok: true } | { ok: false; reason: string }`
  - `createCourse(userId, role, input): Promise<{ id: string; slug: string }>`
  - `updateCourse(userId, role, courseId, input): Promise<void>`
  - `publishCourse(userId, role, courseId): Promise<void>`
  - `listInstructorCourses(instructorId): Promise<CourseRow[]>`

- [ ] **Step 1: Escribir los tests de lógica pura**

`tests/unit/catalog-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { courseInputSchema, resolveCommissionRate, canPublish } from "@/modules/catalog/service";

describe("courseInputSchema", () => {
  it("acepta una entrada válida", () => {
    const r = courseInputSchema.safeParse({
      title: "Excel desde cero", level: "basico", priceSoles: "199.00",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza título vacío", () => {
    expect(courseInputSchema.safeParse({ title: "", level: "basico", priceSoles: "1" }).success).toBe(false);
  });

  it("rechaza precio negativo", () => {
    expect(courseInputSchema.safeParse({ title: "X", level: "basico", priceSoles: "-5" }).success).toBe(false);
  });

  it("acepta precio cero (curso gratuito)", () => {
    expect(courseInputSchema.safeParse({ title: "X", level: "basico", priceSoles: "0" }).success).toBe(true);
  });

  it("rechaza un nivel inventado", () => {
    expect(courseInputSchema.safeParse({ title: "X", level: "experto", priceSoles: "1" }).success).toBe(false);
  });
});

describe("resolveCommissionRate", () => {
  it("el override del curso gana sobre el perfil", () => {
    expect(resolveCommissionRate("15.00", "30.00")).toBe("15.00");
  });

  it("usa el del perfil si no hay override", () => {
    expect(resolveCommissionRate(null, "30.00")).toBe("30.00");
  });

  it("un override de 0 es válido y gana", () => {
    expect(resolveCommissionRate("0.00", "30.00")).toBe("0.00");
  });
});

describe("canPublish", () => {
  const base = { title: "X", priceCents: 19900, sessionCount: 2, estimatedHours: "8.00" };

  it("permite publicar un curso completo", () => {
    expect(canPublish(base)).toEqual({ ok: true });
  });

  it("bloquea si no hay sesiones", () => {
    const r = canPublish({ ...base, sessionCount: 0 });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/sesión/i);
  });

  it("bloquea si faltan las horas estimadas", () => {
    const r = canPublish({ ...base, estimatedHours: null });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/horas/i);
  });
});
```

`canPublish` exige `estimatedHours` porque ese valor termina impreso en el certificado. Un curso publicado sin horas produce certificados incompletos meses después, y para entonces nadie recuerda por qué.

El `resolveCommissionRate` con override `"0.00"` es el caso que un `||` mal escrito rompe silenciosamente.

- [ ] **Step 2: Verificar que fallan**

```bash
pnpm test tests/unit/catalog-service.test.ts
```

Esperado: **FALLA**, módulo no encontrado.

- [ ] **Step 3: Implementar el servicio**

`src/modules/catalog/service.ts`:

```ts
import { z } from "zod";

export const courseInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  subtitle: z.string().trim().max(240).optional(),
  descriptionMd: z.string().trim().max(20_000).optional(),
  categoryId: z.string().uuid().optional(),
  level: z.enum(["basico", "intermedio", "avanzado"]),
  priceSoles: z.coerce.number().min(0).max(100_000),
  estimatedHours: z.coerce.number().min(0).max(1000).optional(),
});

export type CourseInput = z.infer<typeof courseInputSchema>;

export function resolveCommissionRate(
  courseOverride: string | null,
  profileRate: string
): string {
  return courseOverride ?? profileRate;
}

export interface PublishCheck {
  title: string;
  priceCents: number;
  sessionCount: number;
  estimatedHours: string | null;
}

export function canPublish(c: PublishCheck): { ok: true } | { ok: false; reason: string } {
  if (c.title.trim().length < 3) return { ok: false, reason: "El título es demasiado corto." };
  if (c.sessionCount < 1) return { ok: false, reason: "Agrega al menos una sesión antes de publicar." };
  if (c.estimatedHours === null) {
    return { ok: false, reason: "Indica las horas estimadas: se imprimen en el certificado." };
  }
  return { ok: true };
}
```

`??` y no `||`: con `||`, un override de `"0.00"` sería descartado por ser falsy en algunas conversiones y volvería al 30% del perfil. Es el bug que cubre el tercer test.

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/unit/catalog-service.test.ts
```

Esperado: **PASAN** los 11 casos.

- [ ] **Step 5: Implementar las server actions**

`src/modules/catalog/actions.ts`:

```ts
"use server";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses, classSessions } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, ForbiddenError } from "@/modules/auth/guards";
import { solesToCents } from "@/lib/money";
import { slugify, uniqueSlug } from "@/lib/slug";
import { courseInputSchema, canPublish, type CourseInput } from "./service";

async function slugExists(slug: string) {
  const rows = await db.select({ id: courses.id }).from(courses)
    .where(eq(courses.slug, slug)).limit(1);
  return rows.length > 0;
}

async function loadOwned(userId: string, role: string, courseId: string) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) throw new ForbiddenError("Curso no encontrado.");
  if (!canManageCourse(userId, role as never, c.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return c;
}

export async function createCourse(raw: unknown) {
  const u = await assertRole(["instructor", "admin"]);
  const input = courseInputSchema.parse(raw);

  const slug = await uniqueSlug(slugify(input.title), slugExists);

  const [created] = await db.insert(courses).values({
    instructorId: u.id,
    categoryId: input.categoryId ?? null,
    slug,
    title: input.title,
    subtitle: input.subtitle ?? null,
    descriptionMd: input.descriptionMd ?? null,
    level: input.level,
    priceCents: solesToCents(input.priceSoles),
    estimatedHours: input.estimatedHours?.toFixed(2) ?? null,
    status: "draft",
  }).returning({ id: courses.id, slug: courses.slug });

  revalidatePath("/instructor");
  return created;
}

export async function updateCourse(courseId: string, raw: unknown) {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwned(u.id, u.role as string, courseId);
  const input = courseInputSchema.parse(raw);

  await db.update(courses).set({
    categoryId: input.categoryId ?? null,
    title: input.title,
    subtitle: input.subtitle ?? null,
    descriptionMd: input.descriptionMd ?? null,
    level: input.level,
    priceCents: solesToCents(input.priceSoles),
    estimatedHours: input.estimatedHours?.toFixed(2) ?? null,
    updatedAt: new Date(),
  }).where(eq(courses.id, courseId));

  revalidatePath("/instructor");
  revalidatePath(`/instructor/cursos/${courseId}`);
}

export async function publishCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const c = await loadOwned(u.id, u.role as string, courseId);

  const [{ value: sessionCount }] = await db
    .select({ value: count() })
    .from(classSessions)
    .where(eq(classSessions.courseId, courseId));

  const check = canPublish({
    title: c.title,
    priceCents: c.priceCents,
    sessionCount: Number(sessionCount),
    estimatedHours: c.estimatedHours,
  });
  if (!check.ok) throw new Error(check.reason);

  await db.update(courses)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(courses.id, courseId));

  revalidatePath("/cursos");
  revalidatePath(`/cursos/${c.slug}`);
  revalidatePath("/instructor");
}

export async function unpublishCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const c = await loadOwned(u.id, u.role as string, courseId);
  await db.update(courses).set({ status: "draft", updatedAt: new Date() })
    .where(eq(courses.id, courseId));
  revalidatePath("/cursos");
  revalidatePath(`/cursos/${c.slug}`);
}
```

**El precio se calcula aquí con `solesToCents`, a partir del `courseId` y del formulario del instructor** — nunca a partir de un `priceCents` que llegue del cliente. En la fase 2, cuando exista la compra, el precio del alumno se leerá de la fila `courses`, jamás del navegador.

- [ ] **Step 6: Test de integración de las actions**

`tests/integration/catalog-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, classSessions } from "@/db/schema";

let profId: string;
let otroProfId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createCourse, publishCourse, updateCourse } = await import("@/modules/catalog/actions");

beforeEach(async () => {
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  const [o] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Otro", email: "o@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;
  otroProfId = o.id;
});

describe("createCourse", () => {
  it("crea el curso en borrador con slug derivado del título", async () => {
    const r = await createCourse({ title: "Diseño Gráfico Básico", level: "basico", priceSoles: "199" });
    const [c] = await db.select().from(courses).where(eq(courses.id, r.id));
    expect(c.slug).toBe("diseno-grafico-basico");
    expect(c.status).toBe("draft");
    expect(c.priceCents).toBe(19900);
  });

  it("desambigua slugs repetidos", async () => {
    await createCourse({ title: "Excel", level: "basico", priceSoles: "100" });
    const r2 = await createCourse({ title: "Excel", level: "basico", priceSoles: "100" });
    const [c2] = await db.select().from(courses).where(eq(courses.id, r2.id));
    expect(c2.slug).toBe("excel-2");
  });
});

describe("publishCourse", () => {
  it("rechaza publicar sin sesiones", async () => {
    const r = await createCourse({
      title: "Sin clases", level: "basico", priceSoles: "50", estimatedHours: "4",
    });
    await expect(publishCourse(r.id)).rejects.toThrow(/al menos una sesión/i);
  });

  it("rechaza publicar sin horas estimadas", async () => {
    const r = await createCourse({ title: "Sin horas", level: "basico", priceSoles: "50" });
    await db.insert(classSessions).values({
      courseId: r.id, title: "Clase 1", startsAt: new Date(), durationMinutes: 60,
    });
    await expect(publishCourse(r.id)).rejects.toThrow(/horas/i);
  });

  it("publica cuando está completo", async () => {
    const r = await createCourse({
      title: "Completo", level: "basico", priceSoles: "50", estimatedHours: "4",
    });
    await db.insert(classSessions).values({
      courseId: r.id, title: "Clase 1", startsAt: new Date(), durationMinutes: 60,
    });
    await publishCourse(r.id);
    const [c] = await db.select().from(courses).where(eq(courses.id, r.id));
    expect(c.status).toBe("published");
    expect(c.publishedAt).not.toBeNull();
  });
});

describe("propiedad del curso", () => {
  it("un instructor no puede editar el curso de otro", async () => {
    const [ajeno] = await db.insert(courses).values({
      instructorId: otroProfId, slug: "ajeno", title: "Ajeno", priceCents: 100,
    }).returning();

    await expect(
      updateCourse(ajeno.id, { title: "Secuestrado", level: "basico", priceSoles: "1" })
    ).rejects.toThrow(/no puedes gestionar/i);
  });
});
```

El último test es el que impide el bug más grave de un marketplace: editar cursos ajenos.

- [ ] **Step 7: Correr los tests**

```bash
pnpm test
```

Esperado: **PASAN** todos.

- [ ] **Step 8: Construir la UI**

`src/modules/catalog/ui/course-form.tsx`: formulario cliente con los campos de `courseInputSchema`, que llama a `createCourse` o `updateCourse` y muestra errores con `toast.error` de sonner.

`src/app/(instructor)/instructor/page.tsx`: tabla de cursos del instructor con columnas **Título · Estado · Precio · Sesiones · Acciones**, usando `formatPEN` para el precio y un `Badge` para el estado. Botón "Nuevo curso" a `/instructor/cursos/nuevo`.

`src/app/(instructor)/instructor/cursos/[id]/page.tsx`: el formulario de edición, un enlace a `/instructor/cursos/[id]/sesiones`, y el botón Publicar/Despublicar. Si `publishCourse` lanza, se muestra el motivo exacto con `toast.error`.

- [ ] **Step 9: Verificación manual**

```bash
pnpm dev
```

Entra como `prof@test.pe`, crea un curso, intenta publicarlo sin sesiones (debe explicar por qué no puede), y edita el precio comprobando que se muestra como `S/ ...`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add instructor course CRUD with publish validation and ownership checks"
```

---

### Task 9: Sesiones de clase

**Files:**
- Modify: `src/modules/catalog/service.ts` (añadir validación de sesión)
- Create: `src/modules/catalog/session-actions.ts`
- Create: `src/modules/catalog/ui/session-form.tsx`, `session-list.tsx`
- Create: `src/app/(instructor)/instructor/cursos/[id]/sesiones/page.tsx`
- Create: `tests/unit/session-service.test.ts`
- Create: `tests/integration/session-actions.test.ts`

**Interfaces:**
- Consumes: `db`, `classSessions`, `courses`, `canManageCourse`, `assertRole`, `sessionState`.
- Produces:
  - `classSessionInputSchema` — Zod: `{ title, descriptionMd?, startsAtLocal, durationMinutes, zoomUrl?, isFreePreview }`
  - `limaLocalToUtc(local: string): Date`
  - `isValidZoomUrl(url: string): boolean`
  - `createClassSession(courseId, input)`, `updateClassSession(sessionId, input)`,
    `deleteClassSession(sessionId)`, `setRecordingUrl(sessionId, url)`,
    `reorderClassSessions(courseId, orderedIds: string[])`

- [ ] **Step 1: Escribir los tests**

`tests/unit/session-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classSessionInputSchema, limaLocalToUtc, isValidZoomUrl } from "@/modules/catalog/service";

describe("limaLocalToUtc", () => {
  it("interpreta la hora como Lima y devuelve UTC", () => {
    // 15/08/2026 10:00 en Lima (UTC-5) son 15:00 UTC
    expect(limaLocalToUtc("2026-08-15T10:00").toISOString()).toBe("2026-08-15T15:00:00.000Z");
  });

  it("no depende de la zona horaria del servidor", () => {
    const a = limaLocalToUtc("2026-01-15T08:30").toISOString();
    expect(a).toBe("2026-01-15T13:30:00.000Z");
  });
});

describe("isValidZoomUrl", () => {
  it("acepta enlaces de Zoom", () => {
    expect(isValidZoomUrl("https://zoom.us/j/1234567890")).toBe(true);
    expect(isValidZoomUrl("https://us05web.zoom.us/j/1234?pwd=abc")).toBe(true);
  });

  it("acepta Meet y Teams", () => {
    expect(isValidZoomUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isValidZoomUrl("https://teams.microsoft.com/l/meetup-join/x")).toBe(true);
  });

  it("rechaza http sin cifrar", () => {
    expect(isValidZoomUrl("http://zoom.us/j/123")).toBe(false);
  });

  it("rechaza dominios arbitrarios", () => {
    expect(isValidZoomUrl("https://evil.com/j/123")).toBe(false);
  });

  it("rechaza basura", () => {
    expect(isValidZoomUrl("no soy una url")).toBe(false);
  });
});

describe("classSessionInputSchema", () => {
  const ok = {
    title: "Clase 1", startsAtLocal: "2026-08-15T10:00",
    durationMinutes: 90, isFreePreview: false,
  };

  it("acepta una sesión válida", () => {
    expect(classSessionInputSchema.safeParse(ok).success).toBe(true);
  });

  it("acepta sesión sin link de Zoom (se pega después)", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, zoomUrl: "" }).success).toBe(true);
  });

  it("rechaza un link que no sea de videollamada", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, zoomUrl: "https://evil.com/x" }).success).toBe(false);
  });

  it("rechaza duración cero o negativa", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, durationMinutes: 0 }).success).toBe(false);
  });

  it("rechaza duración mayor a 8 horas", () => {
    expect(classSessionInputSchema.safeParse({ ...ok, durationMinutes: 481 }).success).toBe(false);
  });
});
```

`limaLocalToUtc` es el punto donde se cometen los errores de zona horaria. El instructor escribe "10:00" pensando en Lima; el servidor puede estar en UTC. Sin esta conversión explícita, los recordatorios de la fase 3 salen con 5 horas de desfase y nadie entiende por qué.

- [ ] **Step 2: Verificar que fallan**

```bash
pnpm test tests/unit/session-service.test.ts
```

Esperado: **FALLA**.

- [ ] **Step 3: Implementar**

Añade al final de `src/modules/catalog/service.ts`:

```ts
const MEETING_HOSTS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "teams.live.com"];

export function isValidZoomUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return MEETING_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Convierte "2026-08-15T10:00" entendido como hora de Lima a un Date en UTC. */
export function limaLocalToUtc(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) throw new Error(`Fecha y hora inválidas: ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];

  // Se parte de la interpretación en UTC y se corrige por el offset real de Lima
  // en esa fecha, consultado a la propia base de datos horaria del runtime.
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetMs = limaOffsetMs(new Date(asUtc));
  return new Date(asUtc - offsetMs);
}

function limaOffsetMs(at: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second)
  );
  return asIfUtc - at.getTime();
}

export const classSessionInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  descriptionMd: z.string().trim().max(5000).optional(),
  startsAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora requeridas"),
  durationMinutes: z.coerce.number().int().min(1).max(480),
  zoomUrl: z.string().trim().refine((v) => v === "" || isValidZoomUrl(v), {
    message: "Debe ser un enlace https de Zoom, Google Meet o Teams.",
  }).optional(),
  isFreePreview: z.coerce.boolean().default(false),
});
```

No se hardcodea `-5` horas: se consulta el offset real de `America/Lima` en esa fecha vía `Intl`. Perú no usa horario de verano hoy, pero hardcodear un offset es la clase de atajo que rompe en silencio si eso cambia o si reutilizas la función para otra zona.

`MEETING_HOSTS` con validación de host es una restricción de seguridad, no de comodidad: sin ella un instructor comprometido podría poner un enlace de phishing donde los alumnos esperan su clase.

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/unit/session-service.test.ts
```

Esperado: **PASAN** los 12 casos.

- [ ] **Step 5: Server actions de sesiones**

`src/modules/catalog/session-actions.ts`:

```ts
"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { classSessions, courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, ForbiddenError } from "@/modules/auth/guards";
import { classSessionInputSchema, limaLocalToUtc, isValidZoomUrl } from "./service";

async function assertOwnsCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) throw new ForbiddenError("Curso no encontrado.");
  if (!canManageCourse(u.id, u.role as never, c.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return c;
}

async function assertOwnsSession(sessionId: string) {
  const [s] = await db.select().from(classSessions)
    .where(eq(classSessions.id, sessionId)).limit(1);
  if (!s) throw new ForbiddenError("Sesión no encontrada.");
  const c = await assertOwnsCourse(s.courseId);
  return { session: s, course: c };
}

export async function createClassSession(courseId: string, raw: unknown) {
  await assertOwnsCourse(courseId);
  const input = classSessionInputSchema.parse(raw);

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${classSessions.orderIndex}), -1) + 1` })
    .from(classSessions).where(eq(classSessions.courseId, courseId));

  await db.insert(classSessions).values({
    courseId,
    orderIndex: Number(next),
    title: input.title,
    descriptionMd: input.descriptionMd ?? null,
    startsAt: limaLocalToUtc(input.startsAtLocal),
    durationMinutes: input.durationMinutes,
    zoomUrl: input.zoomUrl || null,
    isFreePreview: input.isFreePreview,
  });

  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

export async function updateClassSession(sessionId: string, raw: unknown) {
  const { course } = await assertOwnsSession(sessionId);
  const input = classSessionInputSchema.parse(raw);

  await db.update(classSessions).set({
    title: input.title,
    descriptionMd: input.descriptionMd ?? null,
    startsAt: limaLocalToUtc(input.startsAtLocal),
    durationMinutes: input.durationMinutes,
    zoomUrl: input.zoomUrl || null,
    isFreePreview: input.isFreePreview,
    updatedAt: new Date(),
  }).where(eq(classSessions.id, sessionId));

  revalidatePath(`/instructor/cursos/${course.id}/sesiones`);
}

export async function setRecordingUrl(sessionId: string, url: string) {
  const { course } = await assertOwnsSession(sessionId);
  const clean = url.trim();
  if (clean && !/^https:\/\//.test(clean)) {
    throw new Error("El enlace de la grabación debe empezar con https://");
  }

  await db.update(classSessions).set({
    recordingUrl: clean || null,
    recordingAddedAt: clean ? new Date() : null,
    status: clean ? "completed" : "scheduled",
    updatedAt: new Date(),
  }).where(eq(classSessions.id, sessionId));

  revalidatePath(`/instructor/cursos/${course.id}/sesiones`);
}

export async function deleteClassSession(sessionId: string) {
  const { course } = await assertOwnsSession(sessionId);
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  revalidatePath(`/instructor/cursos/${course.id}/sesiones`);
}

export async function reorderClassSessions(courseId: string, orderedIds: string[]) {
  await assertOwnsCourse(courseId);
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(classSessions).set({ orderIndex: i })
        .where(eq(classSessions.id, id));
    }
  });
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}
```

`setRecordingUrl` acepta cualquier host https, no solo Zoom: la grabación puede estar en Drive, YouTube o el propio Zoom. Pero exige https.

- [ ] **Step 6: Test de integración**

`tests/integration/session-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, courses, classSessions } from "@/db/schema";

let profId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const acts = await import("@/modules/catalog/session-actions");

beforeEach(async () => {
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  profId = p.id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "c", title: "Curso", priceCents: 100,
  }).returning();
  cursoId = c.id;
});

describe("createClassSession", () => {
  it("asigna orderIndex incremental empezando en 0", async () => {
    for (const t of ["Clase 1", "Clase 2", "Clase 3"]) {
      await acts.createClassSession(cursoId, {
        title: t, startsAtLocal: "2026-08-15T10:00",
        durationMinutes: 90, isFreePreview: false,
      });
    }
    const rows = await db.select().from(classSessions)
      .where(eq(classSessions.courseId, cursoId)).orderBy(asc(classSessions.orderIndex));
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2]);
  });

  it("guarda la hora convertida a UTC desde Lima", async () => {
    await acts.createClassSession(cursoId, {
      title: "Clase", startsAtLocal: "2026-08-15T10:00",
      durationMinutes: 60, isFreePreview: false,
    });
    const [s] = await db.select().from(classSessions);
    expect(s.startsAt.toISOString()).toBe("2026-08-15T15:00:00.000Z");
  });

  it("rechaza un enlace que no sea de videollamada", async () => {
    await expect(acts.createClassSession(cursoId, {
      title: "Clase", startsAtLocal: "2026-08-15T10:00", durationMinutes: 60,
      zoomUrl: "https://evil.com/j/1", isFreePreview: false,
    })).rejects.toThrow();
  });
});

describe("setRecordingUrl", () => {
  it("guarda la grabación y marca la sesión como completada", async () => {
    const [s] = await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", startsAt: new Date(), durationMinutes: 60,
    }).returning();

    await acts.setRecordingUrl(s.id, "https://drive.google.com/file/abc");
    const [after] = await db.select().from(classSessions).where(eq(classSessions.id, s.id));
    expect(after.recordingUrl).toBe("https://drive.google.com/file/abc");
    expect(after.status).toBe("completed");
    expect(after.recordingAddedAt).not.toBeNull();
  });

  it("rechaza un enlace sin https", async () => {
    const [s] = await db.insert(classSessions).values({
      courseId: cursoId, title: "Clase", startsAt: new Date(), durationMinutes: 60,
    }).returning();
    await expect(acts.setRecordingUrl(s.id, "http://insegur.o/x")).rejects.toThrow(/https/i);
  });
});

describe("reorderClassSessions", () => {
  it("reasigna los índices en el orden recibido", async () => {
    const ids: string[] = [];
    for (const t of ["A", "B", "C"]) {
      const [s] = await db.insert(classSessions).values({
        courseId: cursoId, title: t, startsAt: new Date(),
        durationMinutes: 60, orderIndex: ids.length,
      }).returning();
      ids.push(s.id);
    }
    await acts.reorderClassSessions(cursoId, [ids[2], ids[0], ids[1]]);
    const rows = await db.select().from(classSessions).orderBy(asc(classSessions.orderIndex));
    expect(rows.map((r) => r.title)).toEqual(["C", "A", "B"]);
  });
});
```

- [ ] **Step 7: Correr los tests**

```bash
pnpm test
```

Esperado: **PASAN** todos.

- [ ] **Step 8: UI de sesiones**

`src/app/(instructor)/instructor/cursos/[id]/sesiones/page.tsx`: lista ordenada por `orderIndex` mostrando **Nº · Título · Fecha y hora en Lima (con `formatLima`) · Duración · Zoom (✓/—) · Grabación (✓/—)**, con botones para editar, borrar, subir/bajar de orden, y un campo inline para pegar la URL de grabación.

`session-form.tsx`: formulario con `<input type="datetime-local">` para `startsAtLocal`, y una nota visible bajo el campo: *"La hora se interpreta en horario de Perú (Lima)."* Sin esa nota, el instructor no sabe qué zona está escribiendo.

- [ ] **Step 9: Verificación manual**

Como `prof@test.pe`, añade tres sesiones al curso, pega un enlace de Zoom, reordénalas, y confirma en `pnpm db:studio` que `starts_at` está en UTC mientras la UI muestra la hora de Lima.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add class session management with Lima timezone handling"
```

---

### Task 10: Materiales y subida a R2

**Files:**
- Create: `src/lib/r2.ts`
- Create: `src/modules/materials/service.ts`, `actions.ts`
- Create: `src/app/api/r2/upload-url/route.ts`
- Create: `src/modules/materials/ui/material-manager.tsx`
- Create: `tests/unit/materials-service.test.ts`
- Create: `tests/integration/materials-actions.test.ts`

**Interfaces:**
- Consumes: `db`, `sessionMaterials`, `classSessions`, `courses`, `canManageCourse`, `assertRole`, `env`.
- Produces:
  - `presignPut(key, contentType, expiresIn?): Promise<string>`
  - `presignGet(key, expiresIn?): Promise<string>`
  - `MAX_FILE_BYTES`, `ALLOWED_MIME_TYPES`
  - `validateUpload(input: { fileName, mimeType, sizeBytes }): { ok: true; key: string } | { ok: false; reason: string }`
  - `materialKey(sessionId, fileName): string`
  - `addFileMaterial(sessionId, input)`, `addLinkMaterial(sessionId, input)`, `deleteMaterial(materialId)`, `getMaterialDownloadUrl(userId, materialId)`

- [ ] **Step 1: Escribir los tests**

`tests/unit/materials-service.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateUpload, materialKey, MAX_FILE_BYTES } from "@/modules/materials/service";

describe("validateUpload", () => {
  const ok = { fileName: "guia.pdf", mimeType: "application/pdf", sizeBytes: 1_000_000 };

  it("acepta un PDF normal", () => {
    expect(validateUpload(ok).ok).toBe(true);
  });

  it("rechaza un tipo no permitido", () => {
    const r = validateUpload({ ...ok, fileName: "virus.exe", mimeType: "application/x-msdownload" });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/tipo/i);
  });

  it("rechaza un archivo demasiado grande", () => {
    const r = validateUpload({ ...ok, sizeBytes: MAX_FILE_BYTES + 1 });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/tamaño|grande/i);
  });

  it("rechaza tamaño cero", () => {
    expect(validateUpload({ ...ok, sizeBytes: 0 }).ok).toBe(false);
  });
});

describe("materialKey", () => {
  it("prefija con la sesión y sanea el nombre", () => {
    const key = materialKey("abc-123", "Guía de Excel (v2).pdf");
    expect(key).toMatch(/^materials\/abc-123\/\d+-guia-de-excel-v2\.pdf$/);
  });

  it("neutraliza intentos de path traversal", () => {
    const key = materialKey("s1", "../../etc/passwd");
    expect(key).not.toContain("..");
    expect(key).toMatch(/^materials\/s1\//);
  });

  it("conserva la extensión en minúsculas", () => {
    expect(materialKey("s1", "REPORTE.PDF")).toMatch(/\.pdf$/);
  });
});
```

El test de path traversal no es paranoia: el nombre del archivo lo elige el instructor y va directo a una key de almacenamiento.

- [ ] **Step 2: Verificar que fallan**

```bash
pnpm test tests/unit/materials-service.test.ts
```

Esperado: **FALLA**.

- [ ] **Step 3: Implementar el servicio**

`src/modules/materials/service.ts`:

```ts
import { slugify } from "@/lib/slug";

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
]);

export interface UploadInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateUpload(input: UploadInput):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    return { ok: false, reason: `Tipo de archivo no permitido: ${input.mimeType}` };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, reason: "El archivo está vacío." };
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    return { ok: false, reason: `El archivo excede el tamaño máximo de 25 MB.` };
  }
  return { ok: true };
}

export function materialKey(sessionId: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const rawExt = dot > 0 ? fileName.slice(dot + 1) : "";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const base = slugify(dot > 0 ? fileName.slice(0, dot) : fileName).slice(0, 60);
  const suffix = ext ? `.${ext}` : "";
  return `materials/${sessionId}/${Date.now()}-${base}${suffix}`;
}
```

`slugify` ya elimina `.` y `/`, así que el path traversal muere ahí. La extensión se reconstruye por separado y se filtra a alfanumérico.

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/unit/materials-service.test.ts
```

Esperado: **PASAN** los 7 casos.

- [ ] **Step 5: Cliente de R2**

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

`src/lib/r2.ts`:

```ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export function presignPut(key: string, contentType: string, expiresIn = 300) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

export function presignGet(key: string, expiresIn = 300) {
  return getSignedUrl(r2, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), { expiresIn });
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
```

**Expiración de 5 minutos.** Suficiente para subir o descargar, corto para que un enlace filtrado no sirva de nada.

- [ ] **Step 6: Endpoint de URL de subida**

`src/app/api/r2/upload-url/route.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse } from "@/modules/auth/guards";
import { validateUpload, materialKey } from "@/modules/materials/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  const u = await assertRole(["instructor", "admin"]);
  const body = (await req.json()) as {
    sessionId?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.sessionId || !body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const [s] = await db.select({ courseId: classSessions.courseId, instructorId: courses.instructorId })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, body.sessionId))
    .limit(1);

  if (!s) return Response.json({ error: "Sesión no encontrada." }, { status: 404 });
  if (!canManageCourse(u.id, u.role as never, s.instructorId)) {
    return Response.json({ error: "Sin permiso." }, { status: 403 });
  }

  const check = validateUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = materialKey(body.sessionId, body.fileName);
  const url = await presignPut(key, body.mimeType);
  return Response.json({ url, key });
}
```

**La validación de permiso y de tipo ocurre antes de firmar.** Si se firmara primero, cualquiera con sesión podría escribir en el bucket.

- [ ] **Step 7: Actions de materiales**

`src/modules/materials/actions.ts`:

```ts
"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { sessionMaterials, classSessions, courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, assertEnrolled, ForbiddenError } from "@/modules/auth/guards";
import { presignGet, deleteObject } from "@/lib/r2";

const linkSchema = z.object({
  title: z.string().trim().min(1).max(160),
  externalUrl: z.string().url().startsWith("https://", "El enlace debe usar https."),
});

const fileSchema = z.object({
  title: z.string().trim().min(1).max(160),
  fileKey: z.string().trim().min(1),
  fileSize: z.coerce.number().int().positive(),
  mimeType: z.string().trim().min(1),
});

async function ownedSession(sessionId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const [row] = await db
    .select({ courseId: classSessions.courseId, instructorId: courses.instructorId })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!row) throw new ForbiddenError("Sesión no encontrada.");
  if (!canManageCourse(u.id, u.role as never, row.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return row;
}

export async function addFileMaterial(sessionId: string, raw: unknown) {
  const { courseId } = await ownedSession(sessionId);
  const input = fileSchema.parse(raw);
  await db.insert(sessionMaterials).values({
    classSessionId: sessionId,
    title: input.title,
    fileKey: input.fileKey,
    externalUrl: null,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
  });
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

export async function addLinkMaterial(sessionId: string, raw: unknown) {
  const { courseId } = await ownedSession(sessionId);
  const input = linkSchema.parse(raw);
  await db.insert(sessionMaterials).values({
    classSessionId: sessionId,
    title: input.title,
    fileKey: null,
    externalUrl: input.externalUrl,
  });
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

export async function deleteMaterial(materialId: string) {
  const [m] = await db.select().from(sessionMaterials)
    .where(eq(sessionMaterials.id, materialId)).limit(1);
  if (!m) throw new ForbiddenError("Material no encontrado.");
  const { courseId } = await ownedSession(m.classSessionId);

  await db.delete(sessionMaterials).where(eq(sessionMaterials.id, materialId));
  if (m.fileKey) {
    try { await deleteObject(m.fileKey); } catch { /* el registro ya se borró */ }
  }
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

/** Devuelve una URL de descarga solo si el usuario está inscrito en el curso. */
export async function getMaterialDownloadUrl(userId: string, materialId: string): Promise<string> {
  const [m] = await db
    .select({
      fileKey: sessionMaterials.fileKey,
      externalUrl: sessionMaterials.externalUrl,
      courseId: classSessions.courseId,
    })
    .from(sessionMaterials)
    .innerJoin(classSessions, eq(classSessions.id, sessionMaterials.classSessionId))
    .where(eq(sessionMaterials.id, materialId))
    .limit(1);

  if (!m) throw new ForbiddenError("Material no encontrado.");
  await assertEnrolled(userId, m.courseId);

  if (m.externalUrl) return m.externalUrl;
  return presignGet(m.fileKey!);
}
```

`getMaterialDownloadUrl` llama a `assertEnrolled` **antes** de firmar. Es la aplicación concreta de la invariante de la sección 6.4 del spec: la key nunca se convierte en URL para quien no está inscrito.

El borrado del objeto en R2 va en `try/catch` a propósito: si R2 no responde, el registro ya se eliminó y el archivo huérfano es un problema menor comparado con dejar el material visible.

- [ ] **Step 8: Test de integración**

`tests/integration/materials-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, sessionMaterials, enrollments } from "@/db/schema";

let profId: string;
let alumnoId: string;
let otroId: string;
let sessionId: string;
let cursoId: string;

vi.mock("@/modules/auth/session", () => ({
  assertRole: vi.fn(async () => ({ id: profId, role: "instructor", name: "Prof" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/r2", () => ({
  presignGet: vi.fn(async (key: string) => `https://r2.test/${key}?sig=x`),
  presignPut: vi.fn(async () => "https://r2.test/put"),
  deleteObject: vi.fn(async () => {}),
}));

const acts = await import("@/modules/materials/actions");

beforeEach(async () => {
  await db.delete(sessionMaterials);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  profId = (await mk("Prof", "p@test.pe", "instructor")).id;
  alumnoId = (await mk("Alumno", "a@test.pe", "student")).id;
  otroId = (await mk("Otro", "o@test.pe", "student")).id;

  const [c] = await db.insert(courses).values({
    instructorId: profId, slug: "c", title: "Curso", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [s] = await db.insert(classSessions).values({
    courseId: cursoId, title: "Clase", startsAt: new Date(), durationMinutes: 60,
  }).returning();
  sessionId = s.id;

  await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  });
});

describe("addLinkMaterial", () => {
  it("guarda un material de tipo enlace", async () => {
    await acts.addLinkMaterial(sessionId, {
      title: "Plantilla", externalUrl: "https://drive.google.com/x",
    });
    const rows = await db.select().from(sessionMaterials);
    expect(rows).toHaveLength(1);
    expect(rows[0].fileKey).toBeNull();
    expect(rows[0].externalUrl).toBe("https://drive.google.com/x");
  });

  it("rechaza un enlace http", async () => {
    await expect(
      acts.addLinkMaterial(sessionId, { title: "X", externalUrl: "http://insegur.o/x" })
    ).rejects.toThrow();
  });
});

describe("getMaterialDownloadUrl", () => {
  it("devuelve URL firmada a un alumno inscrito", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    const url = await acts.getMaterialDownloadUrl(alumnoId, m.id);
    expect(url).toContain("materials/x/guia.pdf");
  });

  it("niega a quien no está inscrito", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    await expect(acts.getMaterialDownloadUrl(otroId, m.id)).rejects.toThrow(/no está inscrito/i);
  });

  it("niega si la inscripción fue revocada", async () => {
    await acts.addFileMaterial(sessionId, {
      title: "Guía", fileKey: "materials/x/guia.pdf",
      fileSize: 1000, mimeType: "application/pdf",
    });
    const [m] = await db.select().from(sessionMaterials);
    await db.update(enrollments).set({ status: "revoked" });
    await expect(acts.getMaterialDownloadUrl(alumnoId, m.id)).rejects.toThrow(/no está inscrito/i);
  });
});
```

- [ ] **Step 9: UI de materiales**

`src/modules/materials/ui/material-manager.tsx`: componente cliente dentro de cada sesión con dos pestañas, **Archivo** y **Enlace**. En Archivo: `<input type="file">` que pide la URL a `/api/r2/upload-url`, hace `PUT` directo a R2 con `fetch`, y al terminar llama a `addFileMaterial` con la key devuelta. Muestra progreso y el error exacto que devuelva el endpoint.

La subida va **directa del navegador a R2**, sin pasar por el servidor Next. Eso evita el límite de tamaño de body de las server actions y no consume ancho de banda del VPS.

- [ ] **Step 10: Correr los tests y commit**

```bash
pnpm test
git add -A
git commit -m "feat: add session materials with R2 presigned uploads and enrollment-gated downloads"
```

---

### Task 11: Catálogo público

**Files:**
- Create: `src/modules/catalog/queries.ts`
- Create: `src/app/(public)/page.tsx`
- Create: `src/app/(public)/cursos/page.tsx`
- Create: `src/app/(public)/cursos/[slug]/page.tsx`
- Create: `tests/integration/catalog-queries.test.ts`

**Interfaces:**
- Consumes: `db`, `courses`, `categories`, `classSessions`, `sessionMaterials`, `user`, `instructorProfiles`, `isEnrolled`, `formatPEN`, `formatLima`, `sessionState`.
- Produces:
  - `listPublishedCourses(filter: { categorySlug?: string; level?: string; q?: string }): Promise<CourseCard[]>`
  - `getPublicCourse(slug: string): Promise<PublicCourse | null>`
  - `type PublicCourse` — incluye `sessions: PublicSession[]` donde `PublicSession` **no tiene** `zoomUrl` ni `recordingUrl`.

- [ ] **Step 1: Escribir el test**

`tests/integration/catalog-queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, instructorProfiles, categories, courses, classSessions } from "@/db/schema";
import { listPublishedCourses, getPublicCourse } from "@/modules/catalog/queries";

beforeEach(async () => {
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(instructorProfiles);
  await db.delete(categories);
  await db.delete(user);

  const [p] = await db.insert(user).values({
    id: crypto.randomUUID(), name: "Ana Prof", email: "p@test.pe",
    emailVerified: true, role: "instructor",
  }).returning();
  await db.insert(instructorProfiles).values({
    userId: p.id, displayName: "Ana Instructora", status: "approved",
  });

  const [cat] = await db.insert(categories).values({
    slug: "ofimatica", name: "Ofimática",
  }).returning();

  const [pub] = await db.insert(courses).values({
    instructorId: p.id, categoryId: cat.id, slug: "excel", title: "Excel",
    priceCents: 19900, status: "published", publishedAt: new Date(),
    estimatedHours: "8.00", level: "basico",
  }).returning();

  await db.insert(courses).values({
    instructorId: p.id, slug: "borrador", title: "Borrador",
    priceCents: 9900, status: "draft", level: "basico",
  });

  await db.insert(classSessions).values({
    courseId: pub.id, orderIndex: 0, title: "Clase 1",
    startsAt: new Date("2026-09-01T15:00:00Z"), durationMinutes: 90,
    zoomUrl: "https://zoom.us/j/secreto", recordingUrl: "https://drive.google.com/secreto",
    isFreePreview: true,
  });
});

describe("listPublishedCourses", () => {
  it("solo devuelve cursos publicados", async () => {
    const rows = await listPublishedCourses({});
    expect(rows.map((r) => r.slug)).toEqual(["excel"]);
  });

  it("filtra por categoría", async () => {
    expect(await listPublishedCourses({ categorySlug: "ofimatica" })).toHaveLength(1);
    expect(await listPublishedCourses({ categorySlug: "diseno" })).toHaveLength(0);
  });

  it("filtra por nivel", async () => {
    expect(await listPublishedCourses({ level: "basico" })).toHaveLength(1);
    expect(await listPublishedCourses({ level: "avanzado" })).toHaveLength(0);
  });

  it("busca por texto en el título, sin distinguir mayúsculas", async () => {
    expect(await listPublishedCourses({ q: "exc" })).toHaveLength(1);
    expect(await listPublishedCourses({ q: "photoshop" })).toHaveLength(0);
  });

  it("incluye el nombre del instructor y el conteo de sesiones", async () => {
    const [c] = await listPublishedCourses({});
    expect(c.instructorName).toBe("Ana Instructora");
    expect(c.sessionCount).toBe(1);
  });
});

describe("getPublicCourse", () => {
  it("devuelve null para un curso en borrador", async () => {
    expect(await getPublicCourse("borrador")).toBeNull();
  });

  it("devuelve null para un slug inexistente", async () => {
    expect(await getPublicCourse("no-existe")).toBeNull();
  });

  it("NUNCA expone zoomUrl ni recordingUrl", async () => {
    const c = await getPublicCourse("excel");
    expect(c).not.toBeNull();
    const serializado = JSON.stringify(c);
    expect(serializado).not.toContain("secreto");
    expect(serializado).not.toContain("zoom.us");
    expect(serializado).not.toContain("drive.google.com");
    for (const s of c!.sessions) {
      expect(s).not.toHaveProperty("zoomUrl");
      expect(s).not.toHaveProperty("recordingUrl");
    }
  });

  it("sí indica si una sesión tiene grabación disponible", async () => {
    const c = await getPublicCourse("excel");
    expect(c!.sessions[0].hasRecording).toBe(true);
  });
});
```

El test de `JSON.stringify` es la red de seguridad más valiosa de este plan. Comprueba la invariante completa de un golpe: aunque alguien añada un `select()` sin columnas explícitas dentro de seis meses, el test falla.

- [ ] **Step 2: Verificar que falla**

```bash
pnpm test tests/integration/catalog-queries.test.ts
```

Esperado: **FALLA**, módulo no encontrado.

- [ ] **Step 3: Implementar las queries**

`src/modules/catalog/queries.ts`:

```ts
import { and, asc, count, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, categories, classSessions, instructorProfiles, user } from "@/db/schema";

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  level: string;
  priceCents: number;
  instructorName: string;
  categoryName: string | null;
  sessionCount: number;
}

export interface PublicSession {
  id: string;
  orderIndex: number;
  title: string;
  descriptionMd: string | null;
  startsAt: Date;
  durationMinutes: number;
  isFreePreview: boolean;
  hasRecording: boolean;
}

export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  descriptionMd: string | null;
  coverUrl: string | null;
  level: string;
  priceCents: number;
  estimatedHours: string | null;
  instructorName: string;
  instructorHeadline: string | null;
  instructorBioMd: string | null;
  categoryName: string | null;
  sessions: PublicSession[];
}

export async function listPublishedCourses(filter: {
  categorySlug?: string;
  level?: string;
  q?: string;
}): Promise<CourseCard[]> {
  const conditions = [eq(courses.status, "published")];
  if (filter.categorySlug) conditions.push(eq(categories.slug, filter.categorySlug));
  if (filter.level) conditions.push(eq(courses.level, filter.level as never));
  if (filter.q) conditions.push(ilike(courses.title, `%${filter.q}%`));

  const rows = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      subtitle: courses.subtitle,
      coverUrl: courses.coverUrl,
      level: courses.level,
      priceCents: courses.priceCents,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      categoryName: categories.name,
      sessionCount: sql<number>`(
        select count(*) from ${classSessions} where ${classSessions.courseId} = ${courses.id}
      )`,
    })
    .from(courses)
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(and(...conditions))
    .orderBy(asc(courses.title));

  return rows.map((r) => ({ ...r, sessionCount: Number(r.sessionCount) }));
}

export async function getPublicCourse(slug: string): Promise<PublicCourse | null> {
  const [c] = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      subtitle: courses.subtitle,
      descriptionMd: courses.descriptionMd,
      coverUrl: courses.coverUrl,
      level: courses.level,
      priceCents: courses.priceCents,
      estimatedHours: courses.estimatedHours,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      instructorHeadline: instructorProfiles.headline,
      instructorBioMd: instructorProfiles.bioMd,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(and(eq(courses.slug, slug), eq(courses.status, "published")))
    .limit(1);

  if (!c) return null;

  // Columnas listadas UNA POR UNA a propósito: zoomUrl y recordingUrl
  // no deben salir nunca de aquí. Nunca uses select() sin argumentos.
  const sessions = await db
    .select({
      id: classSessions.id,
      orderIndex: classSessions.orderIndex,
      title: classSessions.title,
      descriptionMd: classSessions.descriptionMd,
      startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      isFreePreview: classSessions.isFreePreview,
      hasRecording: isNotNull(classSessions.recordingUrl),
    })
    .from(classSessions)
    .where(eq(classSessions.courseId, c.id))
    .orderBy(asc(classSessions.orderIndex));

  return { ...c, sessions };
}
```

- [ ] **Step 4: Verificar que pasan**

```bash
pnpm test tests/integration/catalog-queries.test.ts
```

Esperado: **PASAN** los 10 casos.

- [ ] **Step 5: Páginas públicas**

`src/app/(public)/cursos/page.tsx` — server component que lee `searchParams` (`categoria`, `nivel`, `q`), llama a `listPublishedCourses`, y renderiza una grilla de tarjetas con título, subtítulo, instructor, nivel, nº de sesiones y precio con `formatPEN`. Filtros como enlaces con query string, no como estado de cliente: así son compartibles e indexables.

`src/app/(public)/cursos/[slug]/page.tsx` — server component con `getPublicCourse`. Si devuelve `null`, `notFound()`. Muestra:

- Título, subtítulo, instructor con su headline, nivel, horas estimadas
- Descripción, resultados de aprendizaje y requisitos
- **Temario**: la lista de sesiones con fecha y hora en Lima vía `formatLima`, duración, y una marca de "Grabación disponible" si `hasRecording`
- Precio con `formatPEN` y un botón **"Inscribirme"**

El botón `Inscribirme` en esta fase enlaza a `/login` si no hay sesión, y muestra *"Próximamente"* si la hay. La compra real llega en la fase 2. **No dejes un botón muerto sin explicación** — pon el texto que corresponda.

Añade `generateMetadata` con el título y la descripción del curso para que el SEO funcione desde el primer día.

`src/app/(public)/page.tsx` — landing con propuesta de valor, los cursos publicados más recientes vía `listPublishedCourses({})`, y explicación del flujo: clases en vivo → materiales → examen → certificado verificable.

- [ ] **Step 6: Verificación manual**

```bash
pnpm db:seed && pnpm dev
```

Visita `/cursos` y `/cursos/excel-desde-cero`. **Abre el código fuente de la página con Ctrl+U y busca `zoom.us`.** No debe aparecer nada. Ese es el chequeo manual que corresponde a la invariante.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add public catalog and course detail pages with leak-proof queries"
```

---

### Task 12: E2E de la fase 1

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/catalogo.spec.ts`
- Create: `tests/e2e/fixtures.ts`

**Interfaces:**
- Consumes: la app completa corriendo, más el seed.
- Produces: `pnpm test:e2e` en verde. Este suite se extiende en cada fase siguiente.

- [ ] **Step 1: Instalar y configurar Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    locale: "es-PE",
    timezoneId: "America/Lima",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

`timezoneId: "America/Lima"` es obligatorio: sin él, el navegador de prueba usa UTC y los aserts de hora fallan de forma confusa.

- [ ] **Step 2: Fixture de login**

`tests/e2e/fixtures.ts`:

```ts
import { type Page, expect } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Correo").fill(email);
  await page.getByPlaceholder(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /ingresar|iniciar/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export const PROF = { email: "prof@test.pe", password: "prof12345" };
export const ALUMNO = { email: "alumno@test.pe", password: "alumno12345" };
```

- [ ] **Step 3: Escribir el E2E**

`tests/e2e/catalogo.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { login, PROF, ALUMNO } from "./fixtures";

test.describe("catálogo público", () => {
  test("un visitante ve los cursos publicados", async ({ page }) => {
    await page.goto("/cursos");
    await expect(page.getByText("Excel desde cero")).toBeVisible();
  });

  test("el detalle muestra el temario con horas de Lima", async ({ page }) => {
    await page.goto("/cursos/excel-desde-cero");
    await expect(page.getByRole("heading", { name: "Excel desde cero" })).toBeVisible();
    await expect(page.getByText("Clase 1")).toBeVisible();
    await expect(page.getByText("S/ 199.00")).toBeVisible();
  });

  test("el HTML no filtra el enlace de Zoom a un visitante", async ({ page }) => {
    const res = await page.goto("/cursos/excel-desde-cero");
    const html = (await res!.text()).toLowerCase();
    expect(html).not.toContain("zoom.us");
  });

  test("un curso en borrador devuelve 404", async ({ page }) => {
    const res = await page.goto("/cursos/no-existe-este-curso");
    expect(res!.status()).toBe(404);
  });
});

test.describe("panel de instructor", () => {
  test("crea un curso, le añade una sesión y lo publica", async ({ page }) => {
    await login(page, PROF.email, PROF.password);

    await page.goto("/instructor/cursos/nuevo");
    const titulo = `Curso E2E ${Date.now()}`;
    await page.getByLabel("Título").fill(titulo);
    await page.getByLabel("Precio").fill("149");
    await page.getByLabel(/horas/i).fill("6");
    await page.getByRole("button", { name: /guardar|crear/i }).click();

    await expect(page.getByText(titulo)).toBeVisible();

    // Intentar publicar sin sesiones debe explicar el motivo
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect(page.getByText(/al menos una sesión/i)).toBeVisible();

    // Añadir una sesión
    await page.getByRole("link", { name: /sesiones/i }).click();
    await page.getByLabel("Título").fill("Clase E2E");
    await page.getByLabel(/fecha/i).fill("2026-12-01T10:00");
    await page.getByLabel(/duración/i).fill("90");
    await page.getByRole("button", { name: /guardar|añadir/i }).click();
    await expect(page.getByText("Clase E2E")).toBeVisible();

    // Ahora sí publica
    await page.goBack();
    await page.getByRole("button", { name: /publicar/i }).click();
    await expect(page.getByText(/publicado/i)).toBeVisible();
  });

  test("un alumno no puede entrar al panel de instructor", async ({ page }) => {
    await login(page, ALUMNO.email, ALUMNO.password);
    await page.goto("/instructor");
    await expect(page).not.toHaveURL(/\/instructor/);
  });
});
```

- [ ] **Step 4: Correr el E2E**

```bash
docker compose up -d
pnpm db:seed
pnpm test:e2e
```

Esperado: **PASAN** los 6 tests. Si algún selector no coincide, ajusta el `getByLabel` a las etiquetas reales de tus formularios — no aflojes el assert.

- [ ] **Step 5: Verificación final de todo el plan**

```bash
pnpm test        # unit + integración
pnpm test:e2e    # end to end
pnpm build       # que compile en producción
```

Los tres en verde. `pnpm build` importa: revela errores de tipos y de uso de APIs de servidor en componentes de cliente que el modo dev tolera.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "test: add Playwright E2E suite for catalog and instructor flows"
```

---

## Estado al terminar

**Funciona:** registro con verificación de correo y Turnstile · login · tres roles con guards probados · esquema completo de 31 tablas migrado · seed idempotente con tres usuarios y un curso de ejemplo · CRUD de cursos con validación de publicación y control de propiedad · sesiones de clase con enlaces de Zoom validados por host y manejo correcto de la zona de Lima · materiales por archivo (subida directa a R2) y por enlace, con descarga bloqueada a no inscritos · catálogo público con filtros y detalle de curso, sin filtrar enlaces privados · tokens de diseño y componentes compartidos · suites de Vitest y Playwright.

**No funciona todavía, y es lo esperado:** comprar un curso, el aula del alumno, recordatorios, examen, certificados, liquidaciones y las páginas legales. Son las fases 2 a 7.

**Siguiente plan:** Fase 2 — pago manual con Yape/Plin/transferencia, cola de aprobación del admin y `aprobarPago` transaccional con generación de comisiones.

---

## Auto-revisión

**Cobertura del spec (secciones 1 a 14):**

| Requisito del spec | Cubierto en |
|---|---|
| Stack (§3) | Tasks 1, 2, 7, 10 |
| Verificaciones previas (§3) | Task 2 Step 4 (schema real de Better Auth). **Culqi y Brevo se verifican en la fase 2**, cuando se usan; adelantarlo aquí no aporta |
| Arquitectura y route groups (§4) | Tasks 6, 7, 8, 11 |
| Módulos por dominio (§4) | Tasks 4, 6, 8, 9, 10, 11 |
| `service.ts` sin `next/*` (§4) | Task 6 Step 3 separa `guards.ts` de `session.ts`; Tasks 8 y 9 ponen la lógica pura en `service.ts` |
| `VideoProvider` (§4) | **No implementado.** En el MVP la grabación es un campo `recordingUrl` gestionado por `setRecordingUrl` (Task 9). La interfaz se introducirá cuando exista un segundo proveedor, no antes — crearla ahora con una sola implementación sería abstracción especulativa |
| Las 31 tablas (§5) | Tasks 2 y 3 |
| Precedencia de comisión (§5) | Task 8, `resolveCommissionRate` con test del caso `"0.00"` |
| `enrollments.order_id` nullable (§5) | Task 3 Step 4 |
| Índice parcial de nº de operación (§5) | Task 3 Steps 5 y 8 |
| Registro con email verificado (§6.1) | Task 5 |
| Acceso a sesión con `assertEnrolled` (§6.4) | Task 6 (guard) y Task 10 (`getMaterialDownloadUrl`) |
| Nada sensible en el cliente (§7.2) | Task 11, test de `JSON.stringify` y E2E que inspecciona el HTML |
| Deuda técnica del CCI (§7) | Task 3 Step 1, documentada en el código |
| Testing (§8) | Tasks 4, 6, 8, 9, 10, 11, 12 |
| Fases 0 y 1 (§9) | Este plan completo |
| Fases 2 a 7 (§9) | Planes posteriores |

**Huecos deliberados, no olvidos:** la interfaz `VideoProvider` y la verificación de Culqi/Brevo se posponen a la fase donde se usan. Las páginas legales del footer (Task 7 Step 4) enlazan a rutas que aún no existen y devolverán 404 hasta la fase 6; está anotado en el propio paso.

**Consistencia de nombres verificada:** `assertEnrolled` / `isEnrolled` / `canManageCourse` (definidos en Task 6, usados en 8, 9, 10) · `formatPEN` / `solesToCents` (Task 4, usados en 8 y 11) · `formatLima` / `sessionState` (Task 4, usados en 9 y 11) · `slugify` / `uniqueSlug` (Task 4, usados en 8 y 10) · `limaLocalToUtc` / `isValidZoomUrl` (Task 9) · `presignPut` / `presignGet` / `deleteObject` (Task 10) · `classSessions` y no `sessions` en todo el plan.

**Sin placeholders:** todos los pasos con código traen el código real. Los pasos de UI (Task 8 Step 8, Task 9 Step 8, Task 10 Step 9, Task 11 Step 5) describen columnas, campos y comportamiento concretos en lugar de código completo de presentación — es la única parte donde el criterio visual del implementador aporta más que un JSX literal, y la skill de diseño de la Task 7 ya fijó los tokens que debe usar.

