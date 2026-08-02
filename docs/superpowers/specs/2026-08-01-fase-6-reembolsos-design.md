# Fase 6 — Reembolso y revocación de acceso · diseño

**Fecha:** 2026-08-01
**Estado:** aprobado
**Spec base:** `2026-07-29-plataforma-cursos-online-design.md` §6.9 (reembolso y revocación), §5 (ventana de 30 días de `earnings.available_at`)

Este documento registra las decisiones que el spec dejó abiertas para esta fase y fija
la forma concreta del módulo. Todo lo que el spec ya define (la transacción atómica de
`revocarAcceso`, la ventana de 30 días) sigue vigente tal cual.

## Alcance

El spec base agrupa bajo su "Fase 6" (tabla de la sección 8) varias cosas distintas:
liquidaciones a instructores (payouts), reembolso/revocación, gestión de usuarios,
cupones, Libro de Reclamaciones (obligatorio por Indecopi), y páginas legales
(Términos, Privacidad, Reembolsos). Eso es demasiado para un solo plan de
implementación.

**Esta fase cubre únicamente `revocarAcceso`**: la transacción de reembolso/revocación,
más la UI mínima de admin para dispararla. Quedan fuera, como fases futuras separadas:
liquidaciones/payouts a instructores, cupones, Libro de Reclamaciones, gestión de
usuarios, y las páginas legales de contenido estático (Términos, Privacidad, Política
de Reembolso).

## Decisiones tomadas en esta fase

| Decisión | Elección | Por qué |
|---|---|---|
| Búsqueda de la orden a reembolsar | **Campo único de búsqueda** (número de orden o email del alumno) en `/admin/reembolsos` | No hay listado de órdenes pagadas hoy; construir uno completo (paginado, con filtros) es una pieza mayor que no aporta al objetivo de esta fase. El admin normalmente ya tiene el número de orden o el email del alumno cuando procesa un reembolso. |
| Valor de `enrollments.status` tras el reembolso | **`refunded`**, no `revoked` | El schema (`enrollmentStatus` enum) ya distingue `refunded` de `revoked`; ninguno de los dos se usaba hasta ahora. `refunded` es semánticamente preciso para esta acción y coincide con `orders.status`. `revoked` queda libre para una futura revocación disciplinaria (fraude, violación de términos) que no sea un reembolso. El pseudocódigo del spec base usa la palabra "revoked" de forma genérica, no como el valor exacto del enum. |
| Notificación al alumno | **Sí, por correo** | Mismo patrón que `orderApprovedTemplate`/`orderRejectedTemplate` ya existentes en `billing/actions.ts`. Confirma que el acceso fue revocado y por qué. |
| Reuso de la revocación del certificado | **Función interna compartida `revocarCertificadoTx(tx, enrollmentId, motivo)`** en `certification/issuance.ts` | `revocarCertificado` (Fase 5, admin de certificados) hoy hace su propio `db.update` + `deleteObject` de R2 fuera de cualquier transacción externa. `revocarAcceso` necesita que TODO (orden, inscripción, earnings, certificado) sea atómico en una sola transacción, y una llamada de red a R2 no debe ocurrir dentro de una transacción de BD abierta — mismo principio ya aplicado a `emitirCertificado`. Se extrae la parte de BD a una función que solo actualiza la fila del certificado dentro de un `tx` dado, sin tocar R2; tanto `revocarCertificado` como `revocarAcceso` la llaman, y cada uno hace el `deleteObject` de R2 **después** de que su propia transacción cierra. |

## Módulo `src/modules/refunds/`

Misma separación que `billing`/`certification`.

### `queries.ts` — lecturas, sin `"use server"`

```
buscarOrdenParaReembolso(query: string) -> OrdenParaReembolso | null
    Busca por orders.orderNumber exacto, o si `query` parece un email
    (contiene "@"), por user.email de orders.userId. Devuelve orderId,
    orderNumber, status, totalCents, paidAt, courseTitle, buyerName,
    buyerEmail, enrollmentId (si existe la inscripción asociada).
```

### `actions.ts` — `"use server"`

```
revocarAcceso(orderId: string, motivo: string): Promise<void>
```

**No recibe `userId`.** Se resuelve con `assertRole(["admin"])` internamente.

### Modificación a `certification/issuance.ts`

Se agrega, junto a `emitirCertificado`:

```
revocarCertificadoTx(tx: Transaccion, enrollmentId: string, motivo: string): Promise<{ pdfKey: string | null } | null>
    Busca el certificado de esa inscripción dentro de `tx`. Si no existe
    (el alumno nunca aprobó el examen), no hace nada y devuelve null. Si
    existe, fija revokedAt/revokeReason/pdfKey=null y devuelve la pdfKey
    ANTERIOR (para que el llamador borre el objeto de R2 después de que
    su transacción cierre). Idempotente: si ya estaba revocado, no
    lo vuelve a tocar.
```

`certification/actions.ts` (`revocarCertificado`) se refactoriza para usar
`db.transaction` envolviendo una llamada a `revocarCertificadoTx`, seguida del
`deleteObject` de R2 fuera de la transacción — mismo comportamiento externo que hoy,
pero reutilizando la lógica compartida.

## Flujo de `revocarAcceso(orderId, motivo)`

Todo dentro de una única `db.transaction`:

1. Carga la orden. Si no existe, error. Si `status === "refunded"`, idempotente: no
   hace nada más (no reenvía el correo) — mismo patrón que `aprobarPago`.
2. Si `status !== "paid"`, rechaza: solo se reembolsa una orden pagada.
3. `orders.status = "refunded"`.
4. `enrollments.status = "refunded"` para la inscripción de ese `orderId`.
5. `instructorEarnings.status = "reversed"` para el/los `orderItem` de esa orden,
   sin importar si ya estaba `pending`, `available` o `paid` — si ya estaba `paid`,
   esto documenta la deuda del instructor (spec: "queda como deuda del instructor"),
   sin construir un mecanismo de cobro de esa deuda: eso es liquidaciones, fuera de
   esta fase.
6. `revocarCertificadoTx(tx, enrollmentId, motivo)` — no falla si no hay certificado.

Fuera de la transacción:

7. Si el certificado tenía `pdfKey`, `deleteObject` en R2 (best-effort: si falla, se
   loguea pero no revierte nada — el reembolso ya quedó confirmado).
8. Email de confirmación al alumno (`refundProcessedTemplate`, nueva plantilla,
   mismo patrón que `orderApprovedTemplate`). Solo se envía si esta llamada fue la
   que efectivamente procesó el reembolso (no en el camino idempotente).

## UI de admin

`src/app/(admin)/admin/reembolsos/page.tsx` — Server Component con un formulario de
búsqueda (campo único: número de orden `PED-YYYY-NNNN` o email). Al encontrar la
orden, muestra una tarjeta con alumno, curso, monto pagado, fecha de pago, estado
actual:

- Si `status === "paid"`: botón "Revocar acceso y reembolsar" que abre el mismo
  patrón de confirmación inline con motivo obligatorio que ya usa
  `RevokeCertificateButton` (componente cliente nuevo,
  `src/modules/refunds/ui/revoke-access-button.tsx`).
- Si `status === "refunded"`: badge "Reembolsada", sin botón.
- Cualquier otro estado (`pending`, `failed`, `expired`): mensaje indicando que la
  orden no está pagada, sin botón.

Enlace nuevo en `(admin)/layout.tsx`, junto a "Pagos"/"Certificados", mismo patrón
`Link` que sus vecinos.

## Rutas

| Ruta | Grupo | Guard |
|---|---|---|
| `/admin/reembolsos` | `(admin)` | `assertRole(["admin"])` |

## Invariantes

1. **`revocarAcceso` no recibe `userId`.** Se resuelve con `assertRole(["admin"])`
   internamente, como todo export de un módulo `"use server"`.
2. **Idempotente sobre `orderId`.** Dos llamadas a `revocarAcceso` para la misma
   orden no duplican el efecto ni reenvían el correo.
3. **Nunca revierte una orden que no esté `paid`.**
4. **Atomicidad:** orden, inscripción, earnings y certificado cambian juntos en una
   sola transacción, o ninguno cambia.
5. **La revocación del certificado y el borrado de R2 nunca bloquean ni revierten
   el reembolso si fallan.** Best-effort, con log — el reembolso de la orden es lo
   que no puede fallar a medias.

## Pruebas

**Integración (Postgres real):** `revocarAcceso` sobre una orden pagada actualiza
los 4 estados (`orders`, `enrollments`, `instructorEarnings`, `certificates` si
existe) en una sola transacción; es idempotente (llamarlo dos veces no reenvía el
email ni falla); rechaza una orden que no está `paid`; funciona igual si la
inscripción nunca generó un certificado (alumno nunca rindió el examen);
`revocarCertificadoTx` reutilizada correctamente desde ambos callers
(`revocarCertificado` y `revocarAcceso`) sin duplicar el update, y
`revocarCertificado` (Fase 5) sigue funcionando exactamente igual tras el refactor
(regresión).

**Playwright:** se evalúa al escribir el plan de implementación si el flujo completo
(comprar con Yape → aprobar → reembolsar) vale la pena como E2E nuevo, o si las
pruebas de integración ya cubren lo esencial de esta fase — dado que ya existe
cobertura E2E de compra y aprobación en fases anteriores, es probable que un test de
integración del flujo de reembolso sea suficiente sin duplicar un E2E completo.

## Huecos deliberados, no olvidos

- No hay mecanismo de cobro de la "deuda" del instructor cuando `instructorEarnings`
  pasa a `reversed` habiendo estado ya `paid` — eso es parte de liquidaciones
  (payouts), fuera de esta fase.
- No hay listado paginado de órdenes pagadas — solo búsqueda puntual.
- Cupones, Libro de Reclamaciones, gestión de usuarios y páginas legales de
  contenido estático quedan como fases futuras separadas.
