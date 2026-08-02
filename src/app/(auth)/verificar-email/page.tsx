import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function VerificarEmailPage() {
  return (
    <div className="glass rounded-2xl p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/12 text-primary">
        <MailCheckIcon className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-[-0.02em] text-foreground">
        Revisa tu correo
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Te enviamos un correo. Abre el enlace que contiene para activar tu cuenta y poder
        inscribirte a los cursos.
      </p>
      <Link
        href="/login"
        className={buttonVariants({ variant: "outline", size: "lg", className: "mt-7 w-full" })}
      >
        Ir a iniciar sesión
      </Link>
    </div>
  );
}
