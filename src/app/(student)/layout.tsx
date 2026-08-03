import { requireUser } from "@/modules/auth/session";
import { env } from "@/env";
import { AppHeader, type AppHeaderNavItem } from "@/components/app-header";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();

  const nav: AppHeaderNavItem[] = [
    { href: "/mi-aprendizaje", label: "Mi aprendizaje" },
    { href: "/certificados", label: "Certificados" },
  ];
  if (u.role === "instructor" || u.role === "admin") {
    nav.push({ href: "/instructor", label: "Instructor" });
  }
  if (u.role === "admin") {
    nav.push({ href: "/admin/pagos", label: "Administración" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader academiaName={env.ACADEMIA_NAME} nav={nav} userName={u.name} userRole={u.role} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
