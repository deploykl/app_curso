import { redirect } from "next/navigation";

export default async function SesionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/instructor/cursos/${id}#sesiones`);
}
