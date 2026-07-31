import { requireUser } from "@/modules/auth/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="mx-auto max-w-4xl px-6 py-8">{children}</div>;
}
