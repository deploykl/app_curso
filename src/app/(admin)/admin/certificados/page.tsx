import { listarCertificados } from "@/modules/certification/queries";
import { RevokeCertificateButton } from "@/modules/certification/ui/revoke-certificate-button";
import { Badge } from "@/components/ui/badge";
import { formatLima } from "@/lib/datetime";

export default async function AdminCertificadosPage() {
  const certificados = await listarCertificados();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Certificados emitidos</h1>
      {certificados.length === 0 ? (
        <p className="text-muted-foreground">Todavía no se ha emitido ningún certificado.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {certificados.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-4 rounded-md border border-border p-4"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {c.code} · {c.studentName} · {c.courseTitle}
                </span>
                <span className="text-xs text-muted-foreground">
                  Emitido el {formatLima(c.issuedAt)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {c.revokedAt ? (
                  <Badge variant="secondary">Revocado</Badge>
                ) : (
                  <RevokeCertificateButton certificateId={c.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
