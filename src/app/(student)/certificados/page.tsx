import Link from "next/link";
import { Award, Download, GraduationCap, Lock, ShieldCheck } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { getMisCertificados } from "@/modules/certification/queries";
import { categoryColor } from "@/modules/catalog/category-colors";
import { formatLima } from "@/lib/datetime";
import { formatPEN } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { CopyCodeButton } from "@/modules/certification/ui/copy-code-button";
import { PagarCertificadoButton } from "@/modules/billing/ui/pagar-certificado-button";

export default async function MisCertificadosPage() {
  const u = await requireUser();
  const certificados = await getMisCertificados(u.id);

  if (certificados.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <Award className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">Todavía no tienes certificados.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Aprueba el examen de un curso para obtener el tuyo.
        </p>
        <Link href="/mi-aprendizaje" className={buttonVariants({ className: "mt-4" })}>
          Ir a mi aprendizaje
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis certificados</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {certificados.length} certificado{certificados.length === 1 ? "" : "s"} emitido
          {certificados.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {certificados.map((c) => {
          const color = categoryColor(c.courseTitle);
          const bloqueado = !c.paidAt;
          return (
            <div
              key={c.code}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
            >
              <div
                className="relative flex h-24 flex-col justify-between overflow-hidden px-4 py-3 text-white"
                style={{
                  background: bloqueado
                    ? "linear-gradient(135deg, oklch(0.5 0.02 275), oklch(0.38 0.02 275))"
                    : `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color}, black 20%))`,
                }}
              >
                {bloqueado ? (
                  <Lock className="absolute -right-3 -top-3 size-20 text-white/10" />
                ) : (
                  <Award className="absolute -right-3 -top-3 size-20 text-white/10" />
                )}
                <div className="grid size-10 place-items-center rounded-lg bg-white/20 backdrop-blur-sm">
                  <GraduationCap className="size-5" />
                </div>
                <span className="w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide">
                  {bloqueado ? "Pendiente de pago" : "Certificado emitido"}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h3 className="text-sm font-semibold leading-snug tracking-tight">{c.courseTitle}</h3>
                  <p className="mt-0.5 text-[0.78rem] text-muted-foreground">
                    {bloqueado ? "Aprobaste el examen" : `Emitido el ${formatLima(c.issuedAt)}`}
                  </p>
                </div>

                {bloqueado ? (
                  <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
                    <p className="text-[0.78rem] text-muted-foreground">
                      Paga {formatPEN(c.certificatePriceCents ?? 0)} para desbloquear tu certificado.
                    </p>
                    <PagarCertificadoButton
                      courseId={c.courseId}
                      label={`Pagar ${formatPEN(c.certificatePriceCents ?? 0)}`}
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                      <span className="font-mono text-sm font-medium tracking-wide">{c.code}</span>
                      <CopyCodeButton code={c.code} />
                    </div>

                    <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                      <a
                        href={`/api/certificados/${c.code}/pdf`}
                        className={buttonVariants({ variant: "outline", size: "sm", className: "flex-1" })}
                      >
                        <Download className="size-3.5" />
                        Descargar PDF
                      </a>
                      <Link
                        href={`/verificar/${c.code}`}
                        target="_blank"
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        <ShieldCheck className="size-3.5" />
                      </Link>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
