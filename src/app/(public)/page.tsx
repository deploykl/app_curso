import Link from "next/link";
import { env } from "@/env";
import { listPublishedCourses } from "@/modules/catalog/queries";
import { formatPEN } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { title: "Clases en vivo", description: "Sesiones por Zoom con tu instructor, en horario de Perú." },
  { title: "Materiales", description: "Guías, plantillas y grabaciones descargables por sesión." },
  { title: "Examen", description: "Evalúa lo aprendido con un banco de preguntas del curso." },
  { title: "Certificado verificable", description: "Un código público que cualquiera puede validar." },
];

export default async function LandingPage() {
  const cursos = await listPublishedCourses({});
  const recientes = cursos.slice(0, 3);

  return (
    <div>
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

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-lg border border-border p-5">
              <span className="text-sm font-medium text-primary">{i + 1}</span>
              <h3 className="mt-1 font-medium">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      {recientes.length > 0 && (
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Cursos recientes</h2>
            <Link href="/cursos" className="text-sm text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {recientes.map((c) => (
              <Link
                key={c.id}
                href={`/cursos/${c.slug}`}
                className="flex flex-col gap-2 rounded-lg border border-border p-5 hover:border-primary"
              >
                <Badge variant="secondary" className="w-fit">{c.categoryName ?? "General"}</Badge>
                <h3 className="text-lg font-medium">{c.title}</h3>
                <div className="mt-auto flex items-center justify-between pt-3 text-sm">
                  <span className="text-muted-foreground">{c.instructorName}</span>
                  <span className="font-semibold">{formatPEN(c.priceCents)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
