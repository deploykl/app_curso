import { assertRole } from "@/modules/auth/session";
import { env } from "@/env";
import { AppHeader, type AppHeaderNavItem } from "@/components/app-header";

const NAV: AppHeaderNavItem[] = [
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/ganancias", label: "Ganancias" },
  { href: "/admin/certificados", label: "Certificados" },
  { href: "/admin/reembolsos", label: "Reembolsos" },
  { href: "/admin/usuarios", label: "Usuarios" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await assertRole(["admin"]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader
        academiaName={env.ACADEMIA_NAME}
        sectionLabel="Administración"
        nav={NAV}
        userName={u.name}
        userRole={u.role}
      />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
