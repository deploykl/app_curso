"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGSAP } from "@gsap/react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/landing/brand-mark";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/motion";
import { signOut, useSession } from "@/lib/auth-client";

const NAV = [
  { href: "/cursos", label: "Cursos" },
  { href: "/#como-funciona", label: "Cómo funciona" },
  { href: "/verificar", label: "Certificado" },
];

/** A dónde lleva el botón de cuenta según el rol de quien haya iniciado sesión. */
function panelFor(role?: string) {
  if (role === "admin") return { href: "/admin/pagos", label: "Panel" };
  if (role === "instructor") return { href: "/instructor", label: "Panel" };
  return { href: "/mi-aprendizaje", label: "Mi aprendizaje" };
}

export function SiteHeader({ academiaName }: { academiaName: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // El landing se sirve prerenderizado, así que la sesión se resuelve en el
  // cliente: sin esto el header siempre mostraba "Iniciar sesión" aunque
  // hubiera sesión activa, y parecía que te había cerrado la sesión.
  const { data: session, isPending } = useSession();
  const panel = panelFor((session?.user as { role?: string } | undefined)?.role);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cerrar el menú al navegar: el header es sticky y no se desmonta entre rutas.
  // Ajuste de estado durante el render (no en un efecto) siguiendo la guía de React.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useGSAP(
    () => {
      const el = panelRef.current;
      if (!el) return;
      gsap.to(el, {
        height: open ? "auto" : 0,
        opacity: open ? 1 : 0,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    { dependencies: [open] }
  );

  return (
    <header className="sticky top-0 z-50">
      <div
        className={cn(
          "bg-background/70 backdrop-blur-md transition-[box-shadow,border-color] duration-300",
          scrolled
            ? "border-b border-border shadow-[0_10px_30px_-24px_rgb(0_0_0/0.6)]"
            : "border-b border-transparent"
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md text-[0.95rem] font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark />
            {academiaName}
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <span className="mx-2 h-5 w-px bg-border" />
            <ThemeToggle />
            {isPending ? (
              <span className="ml-1 h-9 w-28 animate-pulse rounded-lg bg-muted" />
            ) : session ? (
              <>
                <Link
                  href={panel.href}
                  className={buttonVariants({ size: "lg", className: "ml-1" })}
                >
                  {panel.label}
                </Link>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => signOut().then(() => window.location.assign("/"))}
                  className="text-muted-foreground"
                >
                  Salir
                </Button>
              </>
            ) : (
              <Link
                href="/login"
                className={buttonVariants({ size: "lg", className: "ml-1" })}
              >
                Iniciar sesión
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="menu-movil"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
            >
              {open ? <XIcon /> : <MenuIcon />}
            </Button>
          </div>
        </div>

        <div
          id="menu-movil"
          ref={panelRef}
          className="h-0 overflow-hidden opacity-0 md:hidden"
        >
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 border-t border-border px-6 py-4">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            {session ? (
              <>
                <Link
                  href={panel.href}
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ size: "lg", className: "mt-2 w-full" })}
                >
                  {panel.label}
                </Link>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => signOut().then(() => window.location.assign("/"))}
                  className="mt-1 w-full text-muted-foreground"
                >
                  Salir
                </Button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className={buttonVariants({ size: "lg", className: "mt-2 w-full" })}
              >
                Iniciar sesión
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
