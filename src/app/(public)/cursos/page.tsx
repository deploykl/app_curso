import Link from "next/link";
import { SearchIcon, SparklesIcon } from "lucide-react";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { listPublishedCourses } from "@/modules/catalog/queries";
import { CourseCard } from "@/components/landing/course-card";
import { Reveal } from "@/components/motion/reveal";

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

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
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
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        <SparklesIcon className="size-3.5" />
        Catálogo
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em] sm:text-4xl">Cursos</h1>
      <p className="mt-2 text-muted-foreground">
        {cursos.length} curso{cursos.length === 1 ? "" : "s"} disponible{cursos.length === 1 ? "" : "s"}
        {params.categoria || params.nivel || params.q ? " con estos filtros" : ""}.
      </p>

      <form className="relative mt-8 max-w-md" action="/cursos">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder="Buscar por título..."
          className="h-11 w-full rounded-full border border-input bg-card pr-4 pl-10 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {params.categoria && <input type="hidden" name="categoria" value={params.categoria} />}
        {params.nivel && <input type="hidden" name="nivel" value={params.nivel} />}
      </form>

      <div className="mt-5 flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <FilterPill href={buildQuery(params, { categoria: undefined })} active={!params.categoria}>
            Todas las categorías
          </FilterPill>
          {cats.map((c) => (
            <FilterPill
              key={c.id}
              href={buildQuery(params, { categoria: c.slug })}
              active={params.categoria === c.slug}
            >
              {c.name}
            </FilterPill>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterPill href={buildQuery(params, { nivel: undefined })} active={!params.nivel}>
            Todos los niveles
          </FilterPill>
          {LEVELS.map((l) => (
            <FilterPill key={l.value} href={buildQuery(params, { nivel: l.value })} active={params.nivel === l.value}>
              {l.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {cursos.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <SearchIcon className="size-7 text-muted-foreground/60" />
          <p className="font-medium">No encontramos cursos con esos filtros.</p>
          <Link href="/cursos" className="text-sm text-primary hover:underline">
            Quitar todos los filtros
          </Link>
        </div>
      ) : (
        <Reveal stagger className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cursos.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </Reveal>
      )}
    </div>
  );
}
