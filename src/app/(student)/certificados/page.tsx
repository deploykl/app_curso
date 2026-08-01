import { requireUser } from "@/modules/auth/session";
import { getMisCertificados } from "@/modules/certification/queries";
import { formatLima } from "@/lib/datetime";

export default async function MisCertificadosPage() {
  const u = await requireUser();
  const certificados = await getMisCertificados(u.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Mis certificados</h1>
      {certificados.length === 0 ? (
        <p className="text-muted-foreground">
          Todavía no tienes certificados. Aprueba el examen de un curso para obtener uno.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {certificados.map((c) => (
            <li
              key={c.code}
              className="flex items-center justify-between rounded-md border border-border p-4"
            >
              <div className="flex flex-col">
                <span className="font-medium">{c.courseTitle}</span>
                <span className="text-xs text-muted-foreground">
                  Emitido el {formatLima(c.issuedAt)} · {c.code}
                </span>
              </div>
              <a
                href={`/api/certificados/${c.code}/pdf`}
                className="text-sm text-primary hover:underline"
              >
                Descargar PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
