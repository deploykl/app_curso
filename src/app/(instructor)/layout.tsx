import Link from "next/link";
import { assertRole } from "@/modules/auth/session";
import { env } from "@/env";
import { LogoutButton } from "@/components/logout-button";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const u = await assertRole(["instructor", "admin"]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            {env.ACADEMIA_NAME} · Instructor
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/instructor" className="text-muted-foreground hover:text-foreground">
              Mis cursos
            </Link>
            <Link href="/instructor/cursos/nuevo" className="text-muted-foreground hover:text-foreground">
              Nuevo curso
            </Link>
            {u.role === "admin" && (
              <Link href="/admin/pagos" className="text-muted-foreground hover:text-foreground">
                Administración
              </Link>
            )}
            <span className="text-muted-foreground">{u.name}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
