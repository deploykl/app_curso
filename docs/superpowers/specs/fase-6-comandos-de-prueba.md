# Fase 6 (reembolsos) — Comandos para probar

## 1. Automáticos

```bash
# Suite completa (unitarios + integración, BD Postgres real de test)
pnpm test

# Solo lo relevante a reembolsos/certificados de esta fase
pnpm vitest run tests/integration/refunds-queries.test.ts tests/integration/refunds-actions.test.ts tests/integration/certification-admin.test.ts tests/integration/certification-revoke-tx.test.ts tests/integration/billing-approve.test.ts

# Tipos y lint
pnpm exec tsc --noEmit
pnpm lint

# Build de producción (valida que /admin/reembolsos compila y renderiza)
pnpm build

# E2E (Playwright) — requiere servidor levantado o configuración de webServer
pnpm test:e2e
```

Resultado esperado en este momento: 280/280 tests verdes, `tsc`/`lint` sin errores.

## 2. Manual (flujo completo en el navegador)

```bash
# 1. Aplicar migraciones si hace falta
pnpm db:migrate

# 2. (Opcional) Sembrar datos de prueba
pnpm db:seed

# 3. Crear un usuario admin si no existe uno
pnpm user:crear

# 4. Levantar el servidor de desarrollo
pnpm dev
```

Con el servidor corriendo en `http://localhost:3000`:

1. Inicia sesión como alumno, compra un curso (flujo Yape) y sube el comprobante.
2. Inicia sesión como admin, aprueba el pago en `/admin/pagos`.
3. Ve a `/admin/reembolsos`.
4. Busca la orden por su **número de orden** (formato `PED-YYYY-NNNN`) o por el **email del alumno**.
5. Verifica que la tarjeta muestra: alumno, email del comprador, curso, monto, fecha de pago y estado `Pagada` con el botón **"Revocar acceso y reembolsar"**.
6. Haz clic en el botón, escribe un motivo y confirma.
7. Verifica:
   - La orden queda `Reembolsada` (sin botón).
   - El alumno pierde acceso al curso (Zoom/grabaciones/materiales) — probar como alumno.
   - Si el alumno tenía certificado, queda revocado (`/verificar/<code>` debe mostrar "revocado").
   - Llega el correo de confirmación de reembolso al alumno (revisar logs de `sendEmail` si no hay SMTP real configurado).
8. Vuelve a buscar la misma orden en `/admin/reembolsos`: debe seguir en `Reembolsada`, sin duplicar nada al reintentar.
9. (Regresión del fix Critical 2) Haz que el mismo alumno **recompre** el mismo curso y el admin apruebe de nuevo: verifica que el alumno recupera el acceso (`enrollments.status` vuelve a `active`).
10. (Regresión del fix de certificados) Si el alumno vuelve a aprobar el examen tras recomprar, verifica que se emite un certificado **nuevo** y válido (no queda atascado en `revocado`).

## 3. Inspección directa de datos (opcional)

```bash
pnpm db:studio
```

Abre Drizzle Studio para revisar directamente las tablas `orders`, `enrollments`, `instructor_earnings` y `certificates` tras cada paso del flujo manual.
