import Link from "next/link";
import { BrandMark } from "@/components/landing/brand-mark";

const COLUMNS = [
  {
    title: "Plataforma",
    links: [
      { href: "/cursos", label: "Cursos" },
      { href: "/#como-funciona", label: "Cómo funciona" },
      { href: "/verificar", label: "Verificar certificado" },
      { href: "/#preguntas", label: "Preguntas frecuentes" },
    ],
  },
  {
    title: "Cuenta",
    links: [
      { href: "/login", label: "Iniciar sesión" },
      { href: "/registro", label: "Crear cuenta" },
      { href: "/mi-aprendizaje", label: "Mi aprendizaje" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terminos", label: "Términos" },
      { href: "/privacidad", label: "Privacidad" },
      { href: "/reembolsos", label: "Reembolsos" },
      { href: "/reclamaciones", label: "Libro de reclamaciones" },
    ],
  },
];

export function SiteFooter({ academiaName }: { academiaName: string }) {
  return (
    <footer className="mt-24 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-tight">
              <BrandMark />
              {academiaName}
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Cursos en vivo por Zoom, con materiales descargables y un certificado que
              cualquiera puede verificar.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {academiaName}
          </p>
          <p>Hecho en Perú · Precios en soles (PEN)</p>
        </div>
      </div>
    </footer>
  );
}
