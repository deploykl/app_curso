import Link from "next/link";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { listPublishedCourses } from "@/modules/catalog/queries";
import { formatPEN } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

const LEVELS = [
  { value: "basico", label: "Básico" },
  { value: "intermedio", label: "Intermedio" },
  { value: "avanzado", label: "Avanzado" },
] as const;

function buildQuery(params: Record<string, string | undefined>, overrides: Record<string, string | undefined>) {
  const merged = { ...params, ...overrides };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `/cursos?${s}` : "/cursos";
}

export default async function CursosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; nivel?: string; q?: string }>;
}) {
  const params = await searchParams;
  const cats = await db.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories);

  const cursos = await listPublishedCourses({
    categorySlug: params.categoria,
    level: params.nivel as "basico" | "intermedio" | "avanzado" | undefined,
    q: params.q,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Cursos</h1>

      <form className="mt-6 flex flex-wrap items-center gap-3" action="/cursos">
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder="Buscar cursos..."
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        {params.categoria && <input type="hidden" name="categoria" value={params.categoria} />}
        {params.nivel && <input type="hidden" name="nivel" value={params.nivel} />}
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground">
          Buscar
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href={buildQuery(params, { categoria: undefined })} className={!params.categoria ? "font-medium text-primary" : "text-muted-foreground"}>
          Todas las categorías
        </Link>
        {cats.map((c) => (
          <Link
            key={c.id}
            href={buildQuery(params, { categoria: c.slug })}
            className={params.categoria === c.slug ? "font-medium text-primary" : "text-muted-foreground"}
          >
            {c.name}
          </Link>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <Link href={buildQuery(params, { nivel: undefined })} className={!params.nivel ? "font-medium text-primary" : "text-muted-foreground"}>
          Todos los niveles
        </Link>
        {LEVELS.map((l) => (
          <Link
            key={l.value}
            href={buildQuery(params, { nivel: l.value })}
            className={params.nivel === l.value ? "font-medium text-primary" : "text-muted-foreground"}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {cursos.length === 0 ? (
        <p className="mt-12 text-muted-foreground">No encontramos cursos con esos filtros.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map((c) => (
            <Link
              key={c.id}
              href={`/cursos/${c.slug}`}
              className="flex flex-col gap-2 rounded-lg border border-border p-5 hover:border-primary"
            >
              <div className="flex items-center justify-between">
                <Badge variant="secondary">{c.categoryName ?? "General"}</Badge>
                <Badge variant="outline">{c.level}</Badge>
              </div>
              <h2 className="text-lg font-medium">{c.title}</h2>
              {c.subtitle && <p className="text-sm text-muted-foreground">{c.subtitle}</p>}
              <div className="mt-auto flex items-center justify-between pt-3 text-sm">
                <span className="text-muted-foreground">{c.instructorName} · {c.sessionCount} sesiones</span>
                <span className="font-semibold">{formatPEN(c.priceCents)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
