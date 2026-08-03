-- Rediseño del PDF del certificado (formato horizontal, logo, paleta nueva).
-- Los PDFs ya subidos a R2 quedaron con el diseño viejo: al vaciar `pdf_key`,
-- el route handler (/api/certificados/[code]/pdf) los vuelve a generar con el
-- diseño actual en la siguiente descarga y sobreescribe el mismo objeto en R2
-- (la key es determinista: certificados/{code}/pdf/certificado.pdf), así que no
-- quedan huérfanos.
UPDATE "certificates" SET "pdf_key" = NULL WHERE "pdf_key" IS NOT NULL;
