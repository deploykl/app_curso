import Link from "next/link";
import { env } from "@/env";

const FOOTER_LINKS = [
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/reembolsos", label: "Reembolsos" },
  { href: "/reclamaciones", label: "Libro de reclamaciones" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            {env.ACADEMIA_NAME}
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/cursos" className="text-muted-foreground hover:text-foreground">
              Cursos
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
            >
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {env.ACADEMIA_NAME}
          </p>
          <nav className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
