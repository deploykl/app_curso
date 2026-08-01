import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { env } from "@/env";
import { LogoutButton } from "@/components/logout-button";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-foreground">
            {env.ACADEMIA_NAME}
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/mi-aprendizaje" className="text-muted-foreground hover:text-foreground">
              Mi aprendizaje
            </Link>
            <span className="text-muted-foreground">{u.name}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
