import Link from "next/link";
import { env } from "@/env";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Aprende en vivo con {env.ACADEMIA_NAME}
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
        Cursos en vivo por Zoom, con materiales descargables y certificación verificable al terminar.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link
          href="/cursos"
          className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ver cursos
        </Link>
        <Link
          href="/registro"
          className="rounded-md border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-accent"
        >
          Crear cuenta
        </Link>
      </div>
    </div>
  );
}
