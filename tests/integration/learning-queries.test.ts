import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { user, courses, classSessions, sessionMaterials, enrollments, sessionAttendance } from "@/db/schema";
import { listMyCourses, getCourseAgenda, getSessionDetail } from "@/modules/learning/queries";
import { ForbiddenError } from "@/modules/auth/guards";

let alumnoId: string;
let otroId: string;
let cursoId: string;
let session1Id: string;
let session2Id: string;
let enrollmentId: string;

beforeEach(async () => {
  await db.delete(sessionAttendance);
  await db.delete(sessionMaterials);
  await db.delete(enrollments);
  await db.delete(classSessions);
  await db.delete(courses);
  await db.delete(user);

  const mk = async (name: string, email: string, role: string) =>
    (await db.insert(user).values({
      id: crypto.randomUUID(), name, email, emailVerified: true, role,
    }).returning())[0];

  const prof = await mk("Prof", "p@test.pe", "instructor");
  alumnoId = (await mk("Alumno", "a@test.pe", "student")).id;
  otroId = (await mk("Otro", "o@test.pe", "student")).id;

  const [c] = await db.insert(courses).values({
    instructorId: prof.id, slug: "curso-x", title: "Curso X", priceCents: 100,
  }).returning();
  cursoId = c.id;

  const [s1] = await db.insert(classSessions).values({
    courseId: cursoId, orderIndex: 0, title: "Clase 1",
    startsAt: new Date(Date.now() - 7 * 86_400_000), durationMinutes: 60,
    zoomUrl: "https://zoom.us/j/1", recordingUrl: "https://cdn.test/rec1.mp4",
  }).returning();
  session1Id = s1.id;

  const [s2] = await db.insert(classSessions).values({
    courseId: cursoId, orderIndex: 1, title: "Clase 2",
    startsAt: new Date(Date.now() + 7 * 86_400_000), durationMinutes: 60,
    zoomUrl: "https://zoom.us/j/2",
  }).returning();
  session2Id = s2.id;

  await db.insert(sessionMaterials).values({
    classSessionId: session1Id, title: "Guía PDF", fileKey: "materials/x/guia.pdf",
  });

  const [e] = await db.insert(enrollments).values({
    userId: alumnoId, courseId: cursoId, status: "active",
  }).returning();
  enrollmentId = e.id;

  await db.insert(sessionAttendance).values({ enrollmentId, classSessionId: session1Id });
});

describe("listMyCourses", () => {
  it("lista los cursos inscritos con progreso y próxima sesión", async () => {
    const rows = await listMyCourses(alumnoId);
    expect(rows).toHaveLength(1);
    expect(rows[0].courseId).toBe(cursoId);
    expect(rows[0].totalSessions).toBe(2);
    expect(rows[0].attendedSessions).toBe(1);
    expect(rows[0].nextSession?.id).toBe(session2Id);
  });

  it("devuelve vacío para alguien sin inscripciones", async () => {
    expect(await listMyCourses(otroId)).toEqual([]);
  });
});

describe("getCourseAgenda", () => {
  it("devuelve las sesiones con estado y marca de asistencia", async () => {
    const agenda = await getCourseAgenda(alumnoId, "curso-x");
    expect(agenda?.sessions).toHaveLength(2);
    const [s1, s2] = agenda!.sessions;
    expect(s1.attended).toBe(true);
    expect(s1.materialCount).toBe(1);
    expect(s1.state).toBe("past");
    expect(s2.attended).toBe(false);
    expect(s2.state).toBe("upcoming");
  });

  it("lanza ForbiddenError si no está inscrito", async () => {
    await expect(getCourseAgenda(otroId, "curso-x")).rejects.toThrow(ForbiddenError);
  });

  it("devuelve null si el curso no existe", async () => {
    expect(await getCourseAgenda(alumnoId, "no-existe")).toBeNull();
  });
});

describe("getSessionDetail", () => {
  it("resuelve zoomUrl, recordingUrl y materiales para un inscrito", async () => {
    const detail = await getSessionDetail(alumnoId, session1Id);
    expect(detail?.zoomUrl).toBe("https://zoom.us/j/1");
    expect(detail?.recordingUrl).toBe("https://cdn.test/rec1.mp4");
    expect(detail?.attended).toBe(true);
    expect(detail?.materials).toEqual([{ id: expect.any(String), title: "Guía PDF" }]);
  });

  it("lanza ForbiddenError para quien no está inscrito", async () => {
    await expect(getSessionDetail(otroId, session1Id)).rejects.toThrow(ForbiddenError);
  });

  it("devuelve null si la sesión no existe", async () => {
    expect(await getSessionDetail(alumnoId, crypto.randomUUID())).toBeNull();
  });
});
