# Fase 5 — Certificados · diseño

**Fecha:** 2026-08-01
**Estado:** aprobado
**Spec base:** `2026-07-29-plataforma-cursos-online-design.md` §6.7 (certificado), §5 (tabla `certificates`), §6.9 (revocación)

Este documento no reemplaza al spec de la plataforma: registra las decisiones que el
spec dejó abiertas para la Fase 5 y fija la forma concreta del módulo. Todo lo que el
spec ya define (formato del código, snapshot al emitir, generación perezosa del PDF,
estados de `/verificar/[code]`) sigue vigente tal cual.

## Decisiones tomadas en esta fase

| Decisión | Elección | Por qué |
|---|---|---|
| Revocación | **Acción de admin independiente**, no ligada a `revocarAcceso` | El módulo de reembolsos (`orders.status = refunded`, `revocarAcceso`) todavía no existe en el código. Se construye la revocación del certificado como una capacidad autónoma del admin (código/alumno/curso + motivo); cuando se construya el módulo de reembolsos, ese flujo llamará a la misma función. |
| Ubicación de la UI de admin | **Página nueva `/admin/certificados`** | Lista todos los certificados emitidos con búsqueda y el botón de revocar, mismo patrón visual que `/admin/pagos`. |
| PDF revocado | **El endpoint del PDF responde 404** si el certificado está revocado, exista o no ya el archivo en R2 | Un certificado revocado no debe poder descargarse, aunque el archivo cacheado siga en el bucket. |
| Generación de PDF y QR | **`@react-pdf/renderer`** (ya sugerido por el spec) + **`qrcode`** para el QR | Ambas son dependencias nuevas; no había ninguna librería de PDF/QR en el proyecto. |

## Alcance

El esquema ya está migrado (`certificates` en `src/db/schema/certification.ts`). **Esta
fase no genera migraciones.** Es código de módulo, acciones, páginas y dos dependencias
nuevas (`@react-pdf/renderer`, `qrcode`).

## Módulo `src/modules/certification/`

Misma separación que `assessment`.

### `service.ts` — puro, sin imports de `next/*` ni de la base de datos

```
generarCodigo() -> string
    8 caracteres en dos bloques de 4 (formato "XXXX-XXXX"), alfabeto sin
    0 O 1 I L (ambiguos al dictarlo). No garantiza unicidad por sí solo — eso lo
    hace el UNIQUE de la tabla más un reintento en la capa de inserción.
```

### `queries.ts` — lecturas, sin `"use server"`

```
getCertificadoPublico(code)            -- válido / revocado / inexistente, sin PII
getMisCertificados(userId)             -- certificados del alumno, para /certificados
getCertificadoPorId(certificateId)     -- para el endpoint del PDF y el admin
listarCertificados(query?)             -- admin: todos, con búsqueda por código/alumno/curso
```

### `actions.ts` — `"use server"`

```
revocarCertificado(certificateId, motivo)   -- solo admin
```

**No recibe `userId`.** Se resuelve con `assertRole(["admin"])` internamente.

### `pdf.ts` — sin `"use server"`, invocado desde el route handler

```
generarYSubirPdf(certificate) -> pdfKey
    Renderiza con @react-pdf/renderer (nombre, curso, instructor, academia, horas,
    nota, código, fecha, QR hacia /verificar/[code] generado con `qrcode`),
    sube a R2 en `certificados/[code]/pdf/certificado.pdf`, devuelve la key.
```

### Hook de emisión — dentro de la transacción del examen

`src/modules/assessment/grading.ts` reemplaza el comentario `FASE 5` por una llamada
real: `if (passed) await emitirCertificado(tx, attempt.enrollmentId, scorePct)`.
`emitirCertificado` vive en `src/modules/certification/service.ts` o un archivo
hermano que sí toca la BD (p. ej. `issuance.ts`, sin `"use server"`, igual que
`grading.ts`) — se decide en el plan de implementación según cómo quede más limpio
pasar el `tx` de una transacción de otro módulo.

```
emitirCertificado(tx, enrollmentId, scorePct)
  ├─ INSERT ... ON CONFLICT (enrollment_id) DO NOTHING   ← idempotente
  ├─ code = generarCodigo(), reintentar en colisión de UNIQUE
  └─ snapshots: studentName (user.name), courseTitle (courses.title),
                instructorName (instructorProfiles.displayName),
                academyName (env.ACADEMIA_NAME), finalScore (scorePct),
                hours (courses.estimatedHours)
     pdfKey queda NULL
```

## Rutas

| Ruta | Grupo | Guard |
|---|---|---|
| `/verificar/[code]` | `(public)` | ninguno — público |
| `/certificados` | `(student)` | `requireUser` |
| `/admin/certificados` | `(admin)` | `assertRole(["admin"])` |
| `GET /api/certificados/[code]/pdf` | `api/` | ninguno — el código ya es la credencial, público como el propio verificador |

## Invariantes

1. **El certificado guarda copias de todo lo que imprime.** Nunca un JOIN en vivo:
   si el alumno cambia de nombre o el curso de título después, el certificado ya
   emitido no cambia.
2. **`emitirCertificado` es idempotente.** Dos llamadas para la misma inscripción
   crean un solo certificado (`ON CONFLICT (enrollment_id) DO NOTHING`).
3. **El código es único** y se reintenta en caso de colisión al generar.
4. **La página pública y el PDF nunca exponen email ni datos personales** fuera de
   lo que el certificado imprime (nombre, curso, instructor, academia, fecha, horas,
   nota).
5. **Un certificado revocado no se descarga.** El endpoint del PDF responde 404
   aunque el archivo siga cacheado en R2.
6. **La generación del PDF es perezosa y no revierte el examen si falla.** Vive
   fuera de la transacción de `cerrarIntento`; un fallo al renderizar o subir a R2
   dentro del endpoint del PDF no afecta al certificado ya emitido, que se reintenta
   en el siguiente acceso.

## Pruebas

**Vitest (`service.ts`, sin BD):** formato del código (8 caracteres, dos bloques de
4 separados por guion); el alfabeto nunca contiene `0`, `O`, `1`, `I`, `L`.

**Integración contra Postgres:** `emitirCertificado` llamado dos veces para la misma
inscripción crea un solo certificado; `revocarCertificado` fija `revokedAt` y
`revokeReason` y solo lo puede llamar un admin; `getCertificadoPublico` devuelve los
tres estados (válido/revocado/inexistente) y el objeto nunca incluye email;
`getMisCertificados` solo devuelve los del usuario que consulta.

**Playwright:** el alumno aprueba un examen (reutiliza el fixture de la Fase 4) →
aparece en `/certificados` → descarga el PDF → `/verificar/[code]` lo muestra sin
login → el admin lo revoca desde `/admin/certificados` → la verificación pasa a
mostrar "revocado" y el PDF responde 404.
