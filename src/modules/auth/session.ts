import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "./guards";

export async function getSessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export async function assertRole(roles: Role[]) {
  const u = await requireUser();
  if (!roles.includes(u.role as Role)) redirect("/");
  return u;
}
