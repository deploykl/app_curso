import Link from "next/link";
import { assertRole } from "@/modules/auth/session";
import { env } from "@/env";
import { LogoutButton } from "@/components/logout-button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await assertRole(["admin"]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            {env.ACADEMIA_NAME} · Administración
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/admin/pagos" className="text-muted-foreground hover:text-foreground">
              Pagos
            </Link>
            <Link href="/admin/ganancias" className="text-muted-foreground hover:text-foreground">
              Ganancias
            </Link>
            <Link href="/admin/certificados" className="text-muted-foreground hover:text-foreground">
              Certificados
            </Link>
            <Link href="/admin/reembolsos" className="text-muted-foreground hover:text-foreground">
              Reembolsos
            </Link>
            <Link href="/admin/usuarios" className="text-muted-foreground hover:text-foreground">
              Usuarios
            </Link>
            <Link href="/admin/configuracion" className="text-muted-foreground hover:text-foreground">
              Configuración
            </Link>
            <span className="text-muted-foreground">{u.name}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
