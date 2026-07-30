# Plataforma de cursos online con certificación — Diseño

**Fecha:** 2026-07-29
**Estado:** aprobado para planificación
**Nombre de la academia:** placeholder `ACADEMIA_NAME` (variable de entorno)

---

## 1. Qué estamos construyendo

Una plataforma web de cursos online donde instructores dictan **clases en vivo por Zoom**, comparten materiales descargables y publican grabaciones. Los alumnos compran el curso, asisten a las sesiones, rinden un examen final y obtienen un **certificado verificable públicamente**.

El dueño de la plataforma es el **administrador general**: aprueba pagos manualmente, cobra una **comisión sobre las ventas de cada instructor** y liquida el neto por transferencia.

### Modelo de negocio

- Arranca como **academia propia** (solo el admin y su equipo publican cursos), con el modelo de datos ya preparado para convertirse en marketplace multi-instructor sin migración destructiva.
- El dinero entra **primero a la cuenta del dueño**, quien luego transfiere el neto al instructor. **No se requiere split de pagos** — esto elimina la principal limitación de las pasarelas peruanas.
- Comisión configurable por instructor (default 30%), con posibilidad de override por curso.

### Mercado y contexto

Perú. Precios en **soles (PEN)**. Zona horaria de visualización: `America/Lima`.

**Stripe no es viable:** no admite entidades peruanas como receptoras de pagos. El MVP cobra mediante **Yape, Plin y transferencia bancaria con validación manual** (comisión 0%, sin requerir RUC). Culqi queda diseñado como segundo proveedor para activar cuando el volumen justifique su ~4% + IGV.

---

## 2. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Tipo de producto | Academia propia, preparada para marketplace |
| Formato principal | Clases en vivo por Zoom (link pegado a mano) + materiales + link de grabación externo |
| Video propio (transcoding/HLS) | **Fuera del MVP**, actualización futura |
| Cohortes | **No.** Venta continua: quien llega tarde ve grabaciones y asiste a lo que falta |
| Cupo por curso o sesión | **No hay límite** |
| Recordatorios de clase | **Sí**, por email a 24h y a 1h antes |
| Examen | **Libre** (no requiere completar sesiones) |
| Nota de aprobación | **70%** |
| Intentos | **3**, luego bloqueo de **24h** |
| Tipos de pregunta | Solo **opción múltiple** y **verdadero/falso** (auto-corregibles) |
| Barajado | Preguntas y opciones se barajan, congeladas por intento |
| Certificado | Requiere aprobar el examen. Lleva alumno, curso, **instructor**, **academia**, fecha, horas, nota |
| Verificación de certificado | **Pública**, código legible + QR → `/verificar/[code]` |
| Pago manual | Yape / Plin / transferencia. Alumno sube captura y declara nombre, DNI, nº de operación |
| Pagos parciales | **No existen.** Solo aprobar o rechazar |
| Reembolso | Revoca acceso, reversa la comisión y **revoca el certificado** |
| Ventana de reembolso | **30 días.** Las comisiones no se liquidan antes |
| Plataforma móvil | Solo **web responsive**. Sin app nativa, sin descarga offline |

---

## 3. Stack

| Capa | Elección | Notas |
|---|---|---|
| Framework | **Next.js 15** App Router + React 19 + TypeScript | Runtime **Node**, no Cloudflare Workers |
| Base de datos | **Postgres** | Docker local en desarrollo; en el mismo VPS en producción. Neon free opcional para demo |
| ORM | **Drizzle** | Migraciones versionadas en el repo |
| Auth | **Better Auth** | Email+password, verificación, reset, Google OAuth, roles |
| UI | **Tailwind v4 + shadcn/ui** | |
| Archivos | **Cloudflare R2** | Bucket privado. Materiales, comprobantes, certificados. Egress $0 |
| Anti-bot | **Cloudflare Turnstile** | En registro y en subida de comprobante |
| Email | **Brevo** (300/día gratis) | Detrás de `notifications/mailer.ts`. Plantillas con React Email |
| PDF | **@react-pdf/renderer** | Sin Chromium, funciona en Node |
| Pagos | Manual (Yape/Plin/transferencia) + **Culqi** en fase posterior | Ambos detrás de la interfaz `PaymentProvider` |
| Video | Link externo (`ExternalLinkProvider`) | Detrás de la interfaz `VideoProvider` para la actualización futura |
| Cron | Cron del sistema en el VPS → endpoint con header secreto | Cada 15 min |
| Errores | **Sentry** (free) | |
| Tests | **Vitest** (unit/integración) + **Playwright** (E2E) | |
| Deploy | **Docker en VPS** (~$6–8/mes) con **Dokploy** + Traefik | Cloudflare para DNS/CDN/TLS |

### Verificaciones pendientes antes de codificar (fase 0)

1. Estado y vigencia del SDK de **Culqi para Node**, y si su flujo de Yape sirve para el caso.
2. Límites exactos del free tier de **Brevo** y de **R2** al momento de implementar.
3. Compatibilidad de **Better Auth** con la versión de Next/React elegida.

No se dan por ciertos: se confirman en la fase 0 y se ajusta el plan si algo cambió.

---

## 4. Arquitectura

Una sola aplicación Next.js con cuatro espacios separados por route groups y middleware de rol.

```
src/app/
  (public)/      landing · /cursos · /cursos/[slug] · /verificar/[code]
                 legales: /terminos · /privacidad · /reembolsos · /reclamaciones
  (auth)/        /login · /registro · /verificar-email · /recuperar
  (student)/     /mi-aprendizaje · /curso/[slug]/aprender/[sessionId]
                 /pago/[orderNumber] · /certificados
  (instructor)/  /instructor  → cursos · sesiones · materiales · examen · alumnos · ingresos
  (admin)/       /admin       → pagos · cursos · usuarios · ventas · liquidaciones · cupones
  api/
    webhooks/culqi/            idempotente
    cron/recordatorios/        auth por header secreto
    certificados/[code]/pdf/
    r2/upload-url/             presigned para subidas
```

### Módulos por dominio

```
src/modules/
  auth/           sesión, roles, guards (assertEnrolled, assertRole)
  catalog/        cursos, categorías, class_sessions, materiales
  enrollment/     inscripción y control de acceso
  learning/       progreso, agenda, estado de sesiones
  assessment/     examen, intentos, calificación
  certification/  emisión, código, PDF, verificación pública
  billing/        órdenes, cupones, PaymentProvider, comprobantes manuales, webhooks
  earnings/       comisión por venta, liquidaciones
  notifications/  mailer, plantillas, email_log
```

Cada módulo expone `schema.ts`, `service.ts`, `actions.ts` y `ui/`.

**Regla dura: `service.ts` no importa nada de `next/*`.** Toda la lógica de negocio —cálculo de nota, cálculo de comisión, reglas de emisión de certificado, elegibilidad de intento— se testea con Vitest sin levantar servidor ni navegador.

### Interfaces de abstracción

```ts
interface PaymentProvider {
  createOrder(input): Promise<OrderRef>
  // el flujo manual no cobra: solo registra el comprobante
}

interface VideoProvider {
  getPlaybackUrl(sessionId: string, userId: string): Promise<string | null>
}
```

`ExternalLinkProvider` en el MVP devuelve `recording_url` si el usuario está inscrito, `null` si no. La actualización de video propio implementa `R2VideoProvider` sin tocar el resto del código.

---

## 5. Modelo de datos

28 tablas. Todo `timestamptz`. Dinero siempre en **céntimos enteros** (`integer`), nunca decimales.

### Auth (gestionadas por Better Auth)

```
users                 id, name, email, email_verified, image, role, created_at, updated_at
sessions              (login)
accounts              (OAuth Google)
verifications         (tokens de email y reset)
```

`users.role`: `student | instructor | admin`. La capacidad de publicar cursos requiere además un `instructor_profiles` con `status = approved`.

```
instructor_profiles   user_id PK/FK, display_name, headline, bio_md, avatar_url,
                      commission_rate NUMERIC(5,2) DEFAULT 30.00,
                      bank_holder, bank_name, bank_cci,
                      status (pending|approved), created_at, updated_at
```

### Catálogo

```
categories            id, slug UQ, name, order_index

courses               id, instructor_id, category_id, slug UQ, title, subtitle,
                      description_md, cover_url, level (basico|intermedio|avanzado),
                      price_cents, currency DEFAULT 'PEN',
                      status (draft|published|archived), published_at,
                      estimated_hours NUMERIC(5,2), commission_rate_override,
                      created_at, updated_at

course_outcomes       id, course_id, text, order_index
course_requirements   id, course_id, text, order_index
```

### Sesiones de clase

```
class_sessions        id, course_id, order_index, title, description_md,
                      starts_at, duration_minutes,
                      zoom_url, recording_url, recording_added_at,
                      is_free_preview, status (scheduled|live|completed|cancelled),
                      created_at, updated_at

session_materials     id, class_session_id, title,
                      file_key, external_url,      -- exactamente uno de los dos
                      file_size, mime_type, uploaded_at
```

**Se llama `class_sessions`, no `sessions`:** Better Auth ya usa `sessions` para las sesiones de login.

### Inscripción y progreso

```
enrollments           id, user_id, course_id, order_id,
                      status (active|refunded|revoked), enrolled_at, completed_at
                      UNIQUE(user_id, course_id)

session_attendance    id, enrollment_id, class_session_id, marked_at
                      UNIQUE(enrollment_id, class_session_id)
```

El progreso es **auto-reportado** por el alumno ("asistí / vi la grabación"). No bloquea nada; alimenta la barra de avance. No se puede verificar asistencia real a Zoom sin integrar su API, que está fuera del MVP.

### Evaluación

```
exams                    id, course_id UQ, title,
                         passing_score DEFAULT 70, max_attempts DEFAULT 3,
                         lockout_hours DEFAULT 24, time_limit_minutes,
                         questions_per_attempt,
                         shuffle_questions DEFAULT true, shuffle_options DEFAULT true,
                         is_published

questions                id, exam_id, type (mcq|true_false), prompt_md,
                         explanation_md, points DEFAULT 1, order_index, is_active
question_options         id, question_id, text, is_correct, order_index

exam_attempts            id, enrollment_id, attempt_number, started_at, submitted_at,
                         expires_at, score NUMERIC(5,2), passed,
                         status (in_progress|submitted|abandoned)
exam_attempt_questions   attempt_id, question_id, order_index
exam_attempt_answers     id, attempt_id, question_id, selected_option_id,
                         is_correct, answered_at
                         UNIQUE(attempt_id, question_id)
```

`exam_attempt_questions` guarda el orden barajado. Si se barajara al renderizar, recargar la página cambiaría el orden a mitad del examen.

### Certificación

```
certificates          id, enrollment_id UQ, code UQ, issued_at,
                      student_name, course_title, instructor_name, academy_name,
                      hours, final_score,
                      pdf_key, revoked_at, revoke_reason
```

Todos los datos impresos son **snapshots** tomados al emitir. Un certificado es un documento con fecha, no un JOIN en vivo.

Formato del código: 8 caracteres en dos bloques, alfabeto sin `0 O 1 I L` para evitar ambigüedad al dictarlo. Ejemplo: `K7M4-P2XR`.

### Pagos

```
orders                id, user_id, order_number UQ, subtotal_cents, discount_cents,
                      total_cents, currency,
                      status (pending|paid|failed|expired|refunded),
                      provider (manual|culqi), provider_charge_id,
                      paid_at, expires_at, created_at

order_items           id, order_id, course_id, instructor_id, title_snapshot,
                      unit_price_cents, commission_rate, commission_cents, net_cents

payment_destinations  id, method (yape|plin|transferencia),
                      holder_name, identifier, bank_name, qr_image_key,
                      instructions_md, is_active, order_index

payment_proofs        id, order_id, method (yape|plin|transferencia),
                      payer_full_name, payer_dni, operation_number,
                      declared_amount_cents, transferred_at, proof_file_key,
                      status (pending|approved|rejected),
                      reviewed_by, reviewed_at, rejection_reason, submitted_at
                      UNIQUE(method, operation_number) WHERE status <> 'rejected'

payment_events        id, provider, provider_event_id UQ, event_type,
                      payload JSONB, order_id, processed_at, error

coupons               id, code UQ, type (percent|fixed), value,
                      max_uses, used_count, valid_from, valid_until,
                      course_id, is_active
coupon_redemptions    id, coupon_id, order_id, user_id
```

`order_number` es **corto y legible** (`PED-2026-0148`) porque el alumno lo escribe en la nota de la transferencia. Es lo que hace posible conciliar el pago.

### Comisiones y liquidaciones

```
instructor_earnings   id, order_item_id UQ, instructor_id,
                      gross_cents, commission_cents, net_cents,
                      status (pending|available|paid|reversed),
                      available_at, payout_id

payouts               id, instructor_id, period_start, period_end, total_cents,
                      status (draft|paid), paid_at, reference, notes
```

### Notificaciones

```
email_log                id, user_id, to_email, template, subject,
                         provider_id, status, sent_at, error

session_reminders_sent   enrollment_id, class_session_id, kind (24h|1h), sent_at
                         UNIQUE(enrollment_id, class_session_id, kind)
```

### Invariantes del modelo

1. **`commission_rate` se copia en `order_item` al vender.** Nunca se lee del perfil del instructor al liquidar. Si mañana cambia la comisión, el histórico contable no se reescribe.
2. **`earnings.available_at` = fecha de venta + 30 días.** No se liquida antes de que expire el derecho a reembolso.
3. **`payment_events.provider_event_id` es UNIQUE.** Única defensa contra el doble cobro por reintento de webhook.
4. **`payment_proofs` tiene UNIQUE sobre (método, nº de operación)** para comprobantes no rechazados. Impide reutilizar la captura de otra persona.
5. **`session_reminders_sent` tiene UNIQUE sobre (enrollment, sesión, tipo).** Garantiza cero emails duplicados aunque el cron se dispare dos veces.
6. **El certificado guarda copias de todo lo que imprime.**
7. **Un `earning` pertenece a un solo `payout`.** `payout_id` se asigna en la misma transacción que crea el payout.

---

## 6. Flujos críticos

### 6.1 Registro

```
POST /registro → Turnstile OK → Better Auth crea user (role=student, email_verified=false)
              → Brevo envía token (expira 24h)
```

**Invariante:** un email sin verificar no puede generar órdenes. Evita ensuciar la cola de aprobación de pagos.

### 6.2 Compra manual — flujo principal del MVP

```
crearOrden(courseId, couponCode?)
  ├─ valida: email verificado · no inscrito ya · curso publicado
  ├─ recalcula el precio EN EL SERVIDOR (nunca confía en el cliente)
  ├─ order_number = PED-2026-0148
  └─ order.status = pending, expires_at = now + 48h

/pago/[orderNumber]
  ├─ muestra monto exacto, QR, número Yape/Plin y CCI desde payment_destinations
  ├─ si total > umbral configurable → destaca transferencia (límite diario de Yape)
  └─ alumno sube captura + declara nombre, DNI, nº operación, monto, fecha

payment_proofs.status = pending → email de aviso al admin

/admin/pagos
  ├─ captura junto a los datos declarados
  ├─ banner fijo: "Verifica en tu app de Yape/banco, no en la imagen"
  └─ Aprobar | Rechazar (con motivo)
```

**`aprobarPago(orderId)` en UNA transacción:**

```
BEGIN
  proof.status = approved, reviewed_by, reviewed_at
  order.status = paid, paid_at
  INSERT order_item          (snapshot de title, price, commission_rate)
  INSERT enrollment          (UNIQUE user+course → idempotente)
  INSERT instructor_earnings
     gross_cents      = unit_price_cents
     commission_cents = round(gross * commission_rate / 100)
     net_cents        = gross - commission
     status = pending, available_at = now + 30 días
  INSERT coupon_redemption + coupon.used_count++   (si aplica)
COMMIT
→ FUERA de la transacción: email "tu acceso está listo"
```

**Invariantes:**
- Si cualquier paso falla, nada se aplica. Un `enrollment` sin `earnings` descuadra la contabilidad de forma permanente.
- El email se envía **después** del COMMIT. Enviarlo dentro y luego revertir promete un acceso inexistente.
- **Rechazar** permite al alumno subir otro comprobante sobre **la misma orden**. No se crea una nueva.
- **Cron diario:** órdenes `pending` con `expires_at` vencido y sin comprobante pendiente → `expired`, y se libera el cupón.

### 6.3 Culqi — fase posterior

```
POST /api/webhooks/culqi
  ├─ 1º INSERT payment_events (provider_event_id UNIQUE) → si existe, 200 y salir
  ├─ 2º verificar firma
  └─ 3º llamar aprobarPago(orderId)   ← LA MISMA función que usa el admin
```

**Invariante:** una sola implementación de la lógica de inscripción y comisión, compartida por el webhook y el panel. Dos implementaciones divergen.

### 6.4 Acceso a una sesión

```
/curso/[slug]/aprender/[sessionId]   (server component)
  ├─ assertEnrolled(userId, courseId) → 403 si no
  ├─ zoom_url y recording_url se resuelven server-side
  └─ materiales: URL presignada de R2, expiración 5 min, generada al hacer clic
```

**Invariante:** `zoom_url`, `recording_url` y las keys de R2 **nunca** aparecen en HTML, props serializadas ni respuestas de API para un usuario no inscrito. `assertEnrolled` se invoca en toda server action y todo loader que toque contenido de curso.

Estados visibles según la hora: *faltan N días* → **EN VIVO AHORA** → *finalizada, grabación disponible*.

### 6.5 Cron de recordatorios

```
cada 15 min → /api/cron/recordatorios (header secreto)

  ventana 24h:  class_sessions scheduled con starts_at ∈ [now+23h15m, now+24h45m]
  ventana 1h:   class_sessions scheduled con starts_at ∈ [now+45m,    now+1h15m]

  para cada (sesión, alumno con enrollment active):
     INSERT session_reminders_sent (...) ON CONFLICT DO NOTHING
     si insertó 0 filas → ya se envió, saltar
     si insertó 1 fila  → enviar email
```

**Invariante:** el `INSERT ... ON CONFLICT` va **antes** del envío. Ese orden garantiza cero duplicados aunque el proceso muera a mitad. Al revés, un fallo posterior al envío reenviaría el email.

Las ventanas se solapan a propósito: perder un recordatorio es peor que calcularlo con holgura, y el UNIQUE absorbe la repetición.

### 6.6 Examen

```
iniciarIntento(courseId)
  ├─ assertEnrolled
  ├─ si existe intento in_progress → devolver ESE (no crear otro)
  ├─ si intentos >= max_attempts y el último fue hace < lockout_hours
  │     → 403 con la hora exacta de desbloqueo
  ├─ selecciona preguntas is_active (questions_per_attempt si está definido)
  ├─ baraja y persiste el orden en exam_attempt_questions
  ├─ el orden de opciones se deriva de una semilla estable (attempt_id + question_id)
  └─ expires_at si hay time_limit_minutes

responder(attemptId, questionId, optionId)
  └─ upsert en exam_attempt_answers. is_correct se calcula y guarda, NO se devuelve.

enviarIntento(attemptId)
  BEGIN
    score  = Σ puntos correctos / Σ puntos totales × 100
    passed = score >= exams.passing_score
    attempt.status = submitted, submitted_at
    si passed → emitirCertificado(enrollmentId)
  COMMIT
  → pantalla de resultados: nota, fallos y explicación por pregunta
```

**Invariantes:**
- `is_correct` **nunca** viaja al cliente antes de enviar el intento. Ni en props de server components, ni en respuestas de acciones.
- Recargar no re-baraja: el orden está congelado.
- Un intento `in_progress` no genera otro. Sin esto, tres pestañas abiertas queman o multiplican los intentos.

### 6.7 Certificado

```
emitirCertificado(enrollmentId)   -- dentro de la transacción del examen
  ├─ INSERT ... ON CONFLICT (enrollment_id) DO NOTHING   ← idempotente
  ├─ code = 8 caracteres legibles, único
  └─ snapshots: student_name, course_title, instructor_name,
                academy_name (= ACADEMIA_NAME), hours, final_score
     pdf_key queda NULL

GET /certificados/[code]/pdf
  ├─ si pdf_key existe → presigned R2
  └─ si no → render con @react-pdf/renderer → subir a R2 → guardar pdf_key
```

**Decisión:** el PDF se genera **perezosamente en el primer acceso**, no dentro de la transacción del examen. Un fallo al generar o subir el PDF no debe revertir un examen aprobado. El certificado existe al aprobar; el archivo es un artefacto cacheado.

```
GET /verificar/[code]   -- público, sin login
  ├─ válido    → alumno, curso, instructor, academia, fecha, horas, nota
  ├─ revocado  → "Este certificado fue revocado el ..."
  └─ inexistente → "No encontramos ningún certificado con ese código"
```

El QR del PDF apunta a esa URL. **Invariante:** la página pública no expone email ni ningún dato personal fuera de lo que está impreso en el certificado.

### 6.8 Comisión y liquidación

```
Venta aprobada → earnings.status = pending, available_at = +30d
Cron diario    → pending con available_at vencido → available

/admin/liquidaciones
  ├─ elegir instructor + periodo
  ├─ agrupar earnings 'available' → INSERT payout (draft), total = Σ net_cents
  │     y asignar payout_id EN LA MISMA TRANSACCIÓN
  ├─ mostrar CCI y titular → el admin transfiere desde su banco
  └─ "Marcar pagada" + nº de operación → earnings.status = paid
```

`/instructor/ingresos` es **solo lectura**: pendiente, disponible, pagado y detalle por venta. El instructor no puede solicitar su propio payout en el MVP.

### 6.9 Reembolso y revocación

```
revocarAcceso(orderId, motivo)
  BEGIN
    order.status = refunded
    enrollment.status = revoked        → pierde Zoom, grabaciones y materiales
    earnings.status = reversed         → si ya estaba 'paid', queda como deuda del instructor
    certificate.revoked_at = now, revoke_reason
  COMMIT
```

**El certificado se revoca.** Acredita un curso pagado; sin revocación habría certificados gratis vía reembolso. Debe estar declarado en la Política de Reembolso.

Por esto `available_at` son 30 días: reversar un earning no pagado es un UPDATE; reversar uno ya transferido es una conversación incómoda.

---

## 7. Seguridad

1. **Autorización centralizada.** `assertEnrolled(userId, courseId)` y `assertRole(role)` son los únicos puntos de decisión. Toda server action y todo loader de contenido pagado los invoca.
2. **Nada sensible en el cliente.** Links de Zoom, links de grabación, keys de R2 y `is_correct` de las preguntas jamás se serializan hacia un usuario sin derecho.
3. **Precios recalculados en el servidor.** Los montos que llegan del formulario se ignoran.
4. **Webhooks idempotentes y con firma verificada**, en ese orden: primero registrar, luego verificar, luego procesar.
5. **Bucket R2 privado.** Todo acceso vía URL presignada de corta expiración generada tras validar permisos.
6. **Turnstile** en registro y en subida de comprobante.
7. **Comprobantes de pago solo visibles para admin.** Contienen DNI y datos bancarios de terceros.
8. **Verificación de pago contra la app bancaria, no contra la imagen.** Las capturas de Yape se falsifican con plantillas de circulación pública. El dato conciliable es nº de operación + monto + fecha. La UI de aprobación lo advierte explícitamente.

### Deuda técnica aceptada

**`instructor_profiles.bank_cci` se guarda en texto plano.** Cifrarlo implica gestionar una clave y su rotación; hecho a medias da falsa seguridad. Con un puñado de instructores y acceso restringido a admin es defendible. **Queda registrado como deuda a resolver antes de abrir el registro de instructores en autoservicio.**

---

## 8. Testing

**Vitest — lógica de negocio sin servidor ni navegador:**
- Cálculo de comisión, incluyendo redondeo de céntimos
- Cálculo de nota y umbral de aprobación
- Elegibilidad de intento: límite, bloqueo de 24h, intento en progreso
- Barajado determinista por semilla
- Generación y unicidad del código de certificado
- Transición de estados de orden, earning y enrollment
- Cálculo de ventanas del cron de recordatorios

**Integración con Postgres real (contenedor de prueba):**
- `aprobarPago` es atómica: se fuerza un fallo a mitad y no queda nada aplicado
- `aprobarPago` es idempotente: dos llamadas no duplican inscripción ni earnings
- El UNIQUE de `payment_proofs` rechaza un nº de operación reutilizado
- El cron de recordatorios ejecutado dos veces envía un solo email
- `emitirCertificado` llamado dos veces crea un solo certificado
- Un earning no puede quedar en dos payouts

**Playwright — un E2E que recorre el MVP completo:**

registro → verificación de email → ver curso → crear orden → subir comprobante → aprobación del admin → acceso al aula → link de Zoom visible → descarga de material → examen aprobado → certificado descargado → verificación pública del código por un visitante anónimo.

**Y un E2E negativo:** un usuario no inscrito no ve el link de Zoom, no descarga materiales y no puede iniciar el examen.

---

## 9. Fases

| # | Fase | Entrega | Días |
|---|---|---|---|
| 0 | Fundación | Docker Compose (Next + Postgres + MailHog), Drizzle con las 28 tablas, Better Auth con roles, layout, guards, seed. Verificaciones de la sección 3 | 1–2 |
| 1 | Catálogo e instructor | CRUD de cursos, class_sessions con fecha y Zoom, materiales a R2, categorías, página pública de curso, `/cursos` con filtros | 3–4 |
| 2 | Pago manual | Orden, pantalla de pago con QR, subida de comprobante, cola en `/admin/pagos`, `aprobarPago` transaccional, earnings, emails | 3–4 |
| 3 | Aula del alumno | `/mi-aprendizaje`, agenda con estados, acceso a Zoom y grabaciones, materiales, progreso, cron de recordatorios | 3–4 |
| 4 | Examen | Banco de preguntas en panel de instructor, intentos con barajado congelado, guardado incremental, calificación, bloqueo, resultados | 3–4 |
| 5 | Certificados | Emisión, código, PDF con QR, `/verificar/[code]`, revocación | 2–3 |
| 6 | Admin y legal | Liquidaciones, reembolso/revocación, usuarios, cupones, Libro de Reclamaciones, Términos, Privacidad, Reembolsos | 3–4 |
| 7 | Cierre | E2E completo, Sentry, `docker-compose.prod.yml`, deploy a VPS con Dokploy, backups a R2 | 2–3 |

**Total: 20–28 días de trabajo enfocado**, 5–7 semanas a medio tiempo. Escribir el código se acelera con asistencia; probar, romper y arreglar no. La mitad del tiempo real está ahí.

Cada fase termina en algo usable. Al final de la 2 ya se puede cobrar y dar acceso.

---

## 10. Definición de listo para lanzar

**El alumno puede:** registrarse → verificar email → ver un curso → yapear → subir comprobante → recibir acceso tras la aprobación → ver la agenda → entrar al Zoom → recibir recordatorios a 24h y 1h → descargar materiales → ver grabaciones → rendir el examen → aprobar → descargar su certificado con QR.

**Un tercero puede:** verificar ese código en la web sin estar logueado.

**El admin puede:** crear cursos y sesiones, aprobar y rechazar pagos, ver ventas, liquidar al instructor, y revocar un acceso junto con su certificado.

Todo eso funcionando de punta a punta, demostrado por el test E2E de la sección 8.

---

## 11. Fuera del alcance

Video propio con transcoding y HLS (la "actualización" planificada) · Reseñas y calificaciones · Registro de instructores en autoservicio · Culqi en producción · Facturación electrónica ante SUNAT (Nubefact/Bsale) · Carrito multi-curso · Cohortes con fechas y cupos por grupo · App móvil y descarga offline · API de Zoom para crear reuniones y registrar asistencia real · Q&A o foro por curso · Notificaciones in-app · Plantillas de certificado configurables · Multi-moneda y multi-idioma.

Ninguno queda a medio hacer. Cada uno es una fase futura limpia sobre este modelo de datos.

---

## 12. Costos

**Desarrollando:** todo local en Docker, más Neon/R2/Brevo/Sentry/Cloudflare/Turnstile en free tier y Culqi en modo test. **$0.** Único gasto real: el dominio, ~$12/año.

**En producción:** VPS ~$5–7/mes + dominio amortizado ~$1/mes. Postgres, Dokploy, Traefik y backups a R2 sin costo adicional. **Total ~$6–8/mes.**

**Al crecer:** Culqi ~4% + IGV por transacción si se activa; email pago al superar el free tier; hosting de video cuando se implemente esa actualización.

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **El contenido no está listo** | La plataforma existe pero no hay nada que vender | Es el cuello de botella real: un curso bien grabado son 40–80 horas. Preparar en paralelo al desarrollo, no después |
| Fraude con capturas de Yape falsificadas | Accesos regalados | Verificar en la app bancaria, no en la imagen. UNIQUE en nº de operación. Advertencia en la UI de aprobación |
| La aprobación manual no escala | A 50 ventas/día requiere personal | Diseño soporta ambos métodos en paralelo. Activar Culqi cuando el volumen justifique el 4% |
| Free tier de email insuficiente | Recordatorios no salen | Brevo da 300/día. Una clase de 150 alumnos consume el día completo. Monitorear y migrar a plan pago cuando toque |
| Link de grabación externo es reenviable | Contenido compartido fuera | Aceptado en el MVP: el valor vendido es la clase en vivo. Es la razón de la actualización de video propio |
| Obligaciones legales en Perú | Multa de Indecopi, problemas con SUNAT | Libro de Reclamaciones y páginas legales entran en la fase 6. RUC, régimen tributario, IGV y facturación electrónica requieren **contador peruano** — fuera del alcance de este diseño |

---

## 14. Requisitos no técnicos

Necesarios para operar, no cubiertos por el código:

- **RUC y régimen tributario.** Requerido por cualquier pasarela para pasar a producción. No lo requiere el flujo de pago manual para empezar.
- **Comprobantes electrónicos ante SUNAT** vía PSE con API (Nubefact, Bsale). Fase futura.
- **Libro de Reclamaciones virtual** — obligatorio por Indecopi. Entra en fase 6.
- **Ley 29733 de Protección de Datos Personales** — política de privacidad, consentimiento explícito en el registro y, según el caso, inscripción del banco de datos ante la ANPD.
- **Contrato escrito con cada instructor** antes del primero: % de comisión, propiedad del contenido, plazos de pago, qué ocurre al terminar la relación.
- Dominio y correo profesional. Datos bancarios para payouts. Canal de soporte (email y WhatsApp). Analítica con Umami o Plausible self-hosted.

**Nada de esto es asesoría legal ni contable.** Sobre IGV en servicios educativos digitales y sobre el régimen tributario aplicable, consultar a un contador peruano.
