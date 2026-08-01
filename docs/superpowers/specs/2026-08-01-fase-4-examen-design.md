# Fase 4 — Examen · diseño

**Fecha:** 2026-08-01
**Estado:** aprobado
**Spec base:** `2026-07-29-plataforma-cursos-online-design.md` §6.6 (examen), §5 (tablas de assessment), §8 (pruebas)

Este documento no reemplaza al spec de la plataforma: registra las decisiones que el
spec dejó abiertas para la Fase 4 y fija la forma concreta del módulo. Todo lo que el
spec ya define (fórmula de nota, invariantes de barajado, flujo de `iniciarIntento` /
`responder` / `enviarIntento`) sigue vigente tal cual.

## Decisiones tomadas en esta fase

| Decisión | Elección | Por qué |
|---|---|---|
| Navegación del examen | **Una pregunta a la vez** con mapa de progreso | El guardado incremental se vuelve natural (una respuesta = una acción), el estado en el cliente es mínimo y recargar a mitad no pierde nada |
| Límite de tiempo | **Implementado, con auto-envío** | Las columnas `time_limit_minutes` y `expires_at` ya existen en el esquema; dejarlas muertas obliga a volver sobre `iniciarIntento` y `enviarIntento` en una fase futura |
| Certificado al aprobar | **Hueco deliberado documentado** | `emitirCertificado` es Fase 5. El gancho queda comentado dentro de la transacción, igual que se hizo con `coupon_redemptions` en la Fase 2 |

## Alcance

El esquema ya está migrado (`drizzle/0001_previous_naoko.sql` crea `exams`,
`questions`, `question_options`, `exam_attempts`, `exam_attempt_questions`,
`exam_attempt_answers`). **Esta fase no genera migraciones.** Es código de módulo,
acciones y páginas.

## Módulo `src/modules/assessment/`

Misma separación que el resto del proyecto.

### `service.ts` — puro, sin imports de `next/*` ni de la base de datos

```
calcularNota(preguntas, respuestas) -> { scorePct, passed }
    Σ puntos de las correctas / Σ puntos totales × 100, redondeado a 2 decimales.
    Con Σ puntos totales = 0 devuelve 0 y passed = false (nunca divide por cero).

barajarConSemilla(items, seed) -> items
    Fisher-Yates alimentado por un PRNG determinista sembrado con `seed`.
    La misma semilla produce siempre el mismo orden.

semillaOpciones(attemptId, questionId) -> string
    Semilla estable para el orden de opciones. No se persiste: se deriva.

evaluarElegibilidad({ intentosUsados, maxAttempts, ultimoIntentoAt, lockoutHours, ahora })
    -> { puedeIniciar: boolean, desbloqueaA: Date | null }
```

`calcularNota` y `evaluarElegibilidad` son el corazón de la fase y se testean con
Vitest sin servidor ni navegador.

### `queries.ts` — lecturas, sin `"use server"`

```
getExamenDeCurso(userId, courseId)      -- vista previa del alumno: intentos usados,
                                           nota de aprobación, elegibilidad
getIntentoParaResolver(userId, attemptId)
                                        -- preguntas en el orden congelado, opciones
                                           barajadas, respuesta ya marcada
getResultado(userId, attemptId)         -- solo si status = submitted
getBancoPreguntas(userId, courseId)     -- instructor: examen + preguntas + opciones
```

**`getIntentoParaResolver` no selecciona `questions.explanation_md` ni
`question_options.is_correct`.** No se filtran después: no se leen. Un campo que nunca
entra en el objeto no puede escaparse por props de un Server Component.

### `actions.ts` — `"use server"`

Alumno: `iniciarIntento(courseId)`, `responder(attemptId, questionId, optionId)`,
`enviarIntento(attemptId)`.
Instructor: `guardarExamen`, `guardarPregunta`, `eliminarPregunta`, `publicarExamen`.

**Ninguna acción recibe `userId`.** Se resuelve con `requireUser()` dentro. Todo export
de un módulo `"use server"` es un endpoint público sin autenticar.

## Rutas

| Ruta | Grupo | Guard |
|---|---|---|
| `/instructor/cursos/[id]/examen` | `(instructor)` | `assertRole(["instructor","admin"])` + `canManageCourse` |
| `/curso/[slug]/examen` | `(student)` | `assertEnrolled` |
| `/curso/[slug]/examen/[attemptId]` | `(student)` | `assertEnrolled` + el intento pertenece a su inscripción |
| `/curso/[slug]/examen/[attemptId]/resultado` | `(student)` | igual, y `status = submitted` |

## Invariantes

1. **`is_correct` y `explanation_md` nunca viajan al cliente con el intento en curso.**
   Ni en props de Server Component, ni en el retorno de una acción, ni en el HTML del RSC.
2. **Recargar no re-baraja.** El orden de preguntas vive en `exam_attempt_questions`;
   el de opciones se deriva de `semillaOpciones(attemptId, questionId)`.
3. **Un intento `in_progress` no genera otro.** `iniciarIntento` devuelve el existente.
   El `UNIQUE(enrollment_id, attempt_number)` es la red ante dos pestañas simultáneas.
4. **`assertEnrolled` en las cuatro entradas de alumno**, incluidas `responder` y
   `enviarIntento`, no solo en las páginas.
5. **El tiempo lo manda el servidor.** `expires_at` se fija al iniciar.
   `responder` rechaza si `ahora > expires_at`; entrar a un intento vencido lo auto-envía
   y lo califica con lo respondido hasta ese momento. El cronómetro del cliente es
   cosmético.
6. **`enviarIntento` es idempotente.** Si ya está `submitted`, redirige al resultado en
   lugar de recalificar.
7. **El intento pertenece al usuario.** Un `attemptId` ajeno responde 404, no 403: no se
   confirma su existencia.

## Hueco deliberado

Dentro de la transacción de `enviarIntento`, donde el spec §6.6 pone
`si passed → emitirCertificado(enrollmentId)`, queda un comentario que apunta a la
Fase 5. La pantalla de resultados de un aprobado dice *"Tu certificado estará disponible
pronto"*. No se crea la tabla de certificados ni el código: eso es la Fase 5 completa.

## Pruebas

**Vitest (`service.ts`, sin BD):** nota con puntos desiguales; umbral exacto en 70
(70 aprueba, 69.99 no); Σ puntos = 0; barajado determinista con la misma semilla y
distinto con otra; elegibilidad en los tres casos (bajo el límite, bloqueado con hora de
desbloqueo, bloqueo ya expirado).

**Integración contra Postgres:** dos `iniciarIntento` seguidos devuelven el mismo
intento y no incrementan `attempt_number`; `enviarIntento` dos veces no cambia la nota
ni el `submitted_at`; un intento vencido se califica solo con lo respondido; `responder`
sobre una pregunta que no pertenece al intento falla.

**Playwright:** el instructor crea el examen y dos preguntas → el alumno lo rinde y
aprueba → la pantalla de resultados muestra la nota. Y el negativo: el HTML de la página
del intento no contiene el texto de la explicación ni marca cuál opción es correcta.
