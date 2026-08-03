import { assertRole } from "@/modules/auth/session";
import { env } from "@/env";
import { AppHeader, type AppHeaderNavItem } from "@/components/app-header";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const u = await assertRole(["instructor", "admin"]);

  const nav: AppHeaderNavItem[] = [
    { href: "/instructor", label: "Mis cursos" },
    { href: "/instructor/pagos", label: "Mis pagos" },
  ];
  if (u.role === "admin") {
    nav.push({ href: "/admin/pagos", label: "Administración" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        academiaName={env.ACADEMIA_NAME}
        sectionLabel="Instructor"
        nav={nav}
        userName={u.name}
        userRole={u.role}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
