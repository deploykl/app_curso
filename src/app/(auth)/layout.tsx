import { env } from "@/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <p className="mb-6 text-center text-sm font-medium text-neutral-500">{env.ACADEMIA_NAME}</p>
      {children}
    </div>
  );
}
