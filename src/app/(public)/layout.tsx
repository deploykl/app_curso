import { env } from "@/env";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader academiaName={env.ACADEMIA_NAME} />
      <main className="flex-1">{children}</main>
      <SiteFooter academiaName={env.ACADEMIA_NAME} />
    </div>
  );
}
