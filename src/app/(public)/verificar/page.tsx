import { redirect } from "next/navigation";
import { VerifyCodeForm } from "@/components/landing/verify-code-form";

export const metadata = {
  title: "Verificar certificado",
  description: "Comprueba si un certificado emitido por la academia es auténtico.",
};

/**
 * Destino del formulario de verificación. Existe para que el formulario
 * funcione como un GET normal —antes de que hidrate el JS o sin JS— y no
 * dependa del router del cliente para navegar.
 */
export default async function VerificarIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const code = codigo?.trim().toUpperCase();
  if (code) redirect(`/verificar/${encodeURIComponent(code)}`);

  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-3xl font-bold tracking-[-0.025em] text-foreground">
        Verificar certificado
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Escribe el código que aparece en el certificado (por ejemplo{" "}
        <span className="font-mono">K7M4-P2XR</span>) y te diremos al instante si es
        auténtico, a quién pertenece y de qué curso.
      </p>
      <div className="mt-8">
        <VerifyCodeForm />
      </div>
    </div>
  );
}
