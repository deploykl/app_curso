-- Custom SQL migration file, put your code below! --
-- Certificados emitidos antes de que existiera el certificado pago quedaron
-- con paid_at NULL (columna nueva sin backfill). Antes de esta feature todo
-- certificado era, en efecto, gratis/ya entregado: se marcan como pagados
-- desde su fecha de emisión para no bloquear certificados ya válidos.
UPDATE "certificates" SET "paid_at" = "issued_at" WHERE "paid_at" IS NULL;
