import { getCertificadoPublico } from "@/modules/certification/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";

export default async function VerificarPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const r = await getCertificadoPublico(code.toUpperCase());

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Verificación de certificado</h1>
      <p className="text-sm text-muted-foreground">Código: {code.toUpperCase()}</p>

      {!r && (
        <div className="rounded-md border border-border p-6">
          <p className="font-medium text-destructive">
            No encontramos ningún certificado con ese código.
          </p>
        </div>
      )}

      {r?.estado === "revocado" && (
        <div className="rounded-md border border-border p-6">
          <Badge variant="secondary">Revocado</Badge>
          <p className="mt-2 text-sm text-muted-foreground">
            Este certificado fue revocado el {formatLima(r.revokedAt)}.
          </p>
        </div>
      )}

      {r?.estado === "valido" && (
        <div className="flex flex-col gap-3 rounded-md border border-border p-6">
          <Badge>Válido</Badge>
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Alumno</dt>
              <dd className="font-medium">{r.studentName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Curso</dt>
              <dd className="font-medium">{r.courseTitle}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Instructor</dt>
              <dd className="font-medium">{r.instructorName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Academia</dt>
              <dd className="font-medium">{r.academyName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de emisión</dt>
              <dd className="font-medium">{formatLima(r.issuedAt)}</dd>
            </div>
            {r.hours !== null && (
              <div>
                <dt className="text-muted-foreground">Horas</dt>
                <dd className="font-medium">{r.hours}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Nota final</dt>
              <dd className="font-medium">{r.finalScore}%</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
