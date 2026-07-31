import { assertRole } from "@/modules/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await assertRole(["admin"]);
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav className="mb-8 flex items-center justify-between border-b pb-4">
        <span className="font-semibold">Administración</span>
        <span className="text-sm text-neutral-500">{u.name}</span>
      </nav>
      {children}
    </div>
  );
}
