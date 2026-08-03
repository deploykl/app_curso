"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MenuIcon, XIcon } from "lucide-react";
import { BrandMark } from "@/components/landing/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";

export interface AppHeaderNavItem {
  href: string;
  label: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  instructor: "Instructor",
  student: "Alumno",
};

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? "");
  return (partes.join("") || nombre.slice(0, 1)).toUpperCase();
}

/**
 * Header compartido por las tres áreas autenticadas (alumno/instructor/admin):
 * mismo look que `SiteHeader` (landing) pero con navegación por rol, resaltado
 * de la ruta activa y menú de usuario en vez de "Iniciar sesión".
 */
export function AppHeader({
  academiaName,
  sectionLabel,
  nav,
  userName,
  userRole,
}: {
  academiaName: string;
  sectionLabel?: string;
  nav: AppHeaderNavItem[];
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Cierra el menú móvil al navegar: el header no se desmonta entre rutas.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  async function onLogout() {
    setLoading(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const avatar = (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
      {iniciales(userName)}
    </span>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-md text-[0.95rem] font-semibold tracking-tight text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <BrandMark />
            <span className="hidden sm:inline">{academiaName}</span>
          </Link>
          {sectionLabel && (
            <>
              <span className="hidden h-5 w-px shrink-0 bg-border sm:block" />
              <span className="truncate text-sm font-medium text-muted-foreground">{sectionLabel}</span>
            </>
          )}
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive(item.href)
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-1 lg:flex">
          <ThemeToggle />
          <span className="mx-1.5 h-5 w-px bg-border" />
          <div className="flex items-center gap-2 pr-1">
            {avatar}
            <div className="flex flex-col leading-tight">
              <span className="max-w-32 truncate text-sm font-medium">{userName}</span>
              <span className="text-[0.68rem] text-muted-foreground">
                {ROLE_LABEL[userRole] ?? userRole}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onLogout}
            disabled={loading}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="menu-app-movil"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
          >
            {open ? <XIcon /> : <MenuIcon />}
          </Button>
        </div>
      </div>

      {open && (
        <div id="menu-app-movil" className="border-t border-border lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 border-t border-border px-6 py-3">
            <div className="flex min-w-0 items-center gap-2">
              {avatar}
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-medium">{userName}</span>
                <span className="text-[0.68rem] text-muted-foreground">
                  {ROLE_LABEL[userRole] ?? userRole}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onLogout}
              disabled={loading}
              className="shrink-0 text-muted-foreground"
            >
              {loading ? "Saliendo..." : "Salir"}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
