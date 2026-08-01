import { describe, it, expect } from "vitest";
import {
  calcularNota,
  barajarConSemilla,
  semillaOpciones,
  evaluarElegibilidad,
  examSettingsSchema,
  questionInputSchema,
} from "@/modules/assessment/service";

describe("calcularNota", () => {
  const preguntas = [
    { id: "a", points: 1 },
    { id: "b", points: 3 },
    { id: "c", points: 1 },
  ];

  it("pondera por puntos, no por cantidad de preguntas", () => {
    // Acierta solo "b": 3 de 5 puntos = 60%.
    const r = calcularNota(preguntas, [{ questionId: "b", isCorrect: true }], 70);
    expect(r.scorePct).toBe(60);
    expect(r.passed).toBe(false);
  });

  it("aprueba exactamente en el umbral", () => {
    // 70 de 100 puntos.
    const p = [{ id: "x", points: 70 }, { id: "y", points: 30 }];
    const r = calcularNota(p, [{ questionId: "x", isCorrect: true }], 70);
    expect(r.scorePct).toBe(70);
    expect(r.passed).toBe(true);
  });

  it("no aprueba justo debajo del umbral", () => {
    const p = [{ id: "x", points: 6999 }, { id: "y", points: 3001 }];
    const r = calcularNota(p, [{ questionId: "x", isCorrect: true }], 70);
    expect(r.scorePct).toBe(69.99);
    expect(r.passed).toBe(false);
  });

  it("ignora respuestas de preguntas que no están en el intento", () => {
    const r = calcularNota(preguntas, [{ questionId: "zzz", isCorrect: true }], 70);
    expect(r.scorePct).toBe(0);
  });

  it("ignora respuestas incorrectas", () => {
    const r = calcularNota(preguntas, [{ questionId: "b", isCorrect: false }], 70);
    expect(r.scorePct).toBe(0);
  });

  it("devuelve 0 y no aprueba si el total de puntos es 0", () => {
    expect(calcularNota([], [], 70)).toEqual({ scorePct: 0, passed: false });
  });

  it("redondea a dos decimales", () => {
    const p = [{ id: "a", points: 1 }, { id: "b", points: 1 }, { id: "c", points: 1 }];
    const r = calcularNota(p, [{ questionId: "a", isCorrect: true }], 70);
    expect(r.scorePct).toBe(33.33);
  });
});

describe("barajarConSemilla", () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("es determinista: la misma semilla da el mismo orden", () => {
    expect(barajarConSemilla(items, "abc")).toEqual(barajarConSemilla(items, "abc"));
  });

  it("semillas distintas dan órdenes distintos", () => {
    expect(barajarConSemilla(items, "abc")).not.toEqual(barajarConSemilla(items, "xyz"));
  });

  it("conserva todos los elementos", () => {
    expect(barajarConSemilla(items, "abc").slice().sort((a, b) => a - b)).toEqual(items);
  });

  it("no muta el arreglo original", () => {
    const original = [1, 2, 3, 4, 5];
    barajarConSemilla(original, "abc");
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it("tolera arreglos vacíos y de un elemento", () => {
    expect(barajarConSemilla([], "abc")).toEqual([]);
    expect(barajarConSemilla(["solo"], "abc")).toEqual(["solo"]);
  });
});

describe("semillaOpciones", () => {
  it("depende del intento y de la pregunta", () => {
    expect(semillaOpciones("A", "1")).toBe(semillaOpciones("A", "1"));
    expect(semillaOpciones("A", "1")).not.toBe(semillaOpciones("A", "2"));
    expect(semillaOpciones("A", "1")).not.toBe(semillaOpciones("B", "1"));
  });
});

describe("evaluarElegibilidad", () => {
  const ahora = new Date("2026-08-01T12:00:00Z");

  it("permite iniciar mientras quedan intentos", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 2, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-08-01T11:00:00Z"), lockoutHours: 24, ahora,
      })
    ).toEqual({ puedeIniciar: true, desbloqueaA: null });
  });

  it("bloquea con la hora exacta de desbloqueo al agotar los intentos", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 3, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-08-01T10:00:00Z"), lockoutHours: 24, ahora,
      })
    ).toEqual({ puedeIniciar: false, desbloqueaA: new Date("2026-08-02T10:00:00Z") });
  });

  it("vuelve a permitir cuando el bloqueo ya expiró", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 3, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-07-30T10:00:00Z"), lockoutHours: 24, ahora,
      })
    ).toEqual({ puedeIniciar: true, desbloqueaA: null });
  });

  it("desbloquea justo al cumplirse la hora, no un instante después", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 3, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-07-31T12:00:00Z"), lockoutHours: 24, ahora,
      }).puedeIniciar
    ).toBe(true);
  });

  it("con lockoutHours = 0 nunca bloquea", () => {
    expect(
      evaluarElegibilidad({
        intentosUsados: 9, maxAttempts: 3,
        ultimoIntentoAt: new Date("2026-08-01T11:59:00Z"), lockoutHours: 0, ahora,
      }).puedeIniciar
    ).toBe(true);
  });
});

describe("examSettingsSchema", () => {
  const base = {
    title: "Examen final",
    passingScore: 70,
    maxAttempts: 3,
    lockoutHours: 24,
    timeLimitMinutes: null,
    questionsPerAttempt: null,
    shuffleQuestions: true,
    shuffleOptions: true,
  };

  it("acepta una configuración válida", () => {
    expect(examSettingsSchema.parse(base).passingScore).toBe(70);
  });

  it("rechaza una nota de aprobación fuera de 1..100", () => {
    expect(() => examSettingsSchema.parse({ ...base, passingScore: 0 })).toThrow();
    expect(() => examSettingsSchema.parse({ ...base, passingScore: 101 })).toThrow();
  });

  it("rechaza cero intentos", () => {
    expect(() => examSettingsSchema.parse({ ...base, maxAttempts: 0 })).toThrow();
  });
});

describe("questionInputSchema", () => {
  const mcq = {
    type: "mcq" as const,
    promptMd: "¿Qué hace BUSCARV?",
    explanationMd: null,
    points: 1,
    options: [
      { text: "Busca en la primera columna", isCorrect: true },
      { text: "Suma un rango", isCorrect: false },
    ],
  };

  it("acepta una pregunta válida", () => {
    expect(questionInputSchema.parse(mcq).options).toHaveLength(2);
  });

  it("exige exactamente una opción correcta", () => {
    expect(() =>
      questionInputSchema.parse({
        ...mcq,
        options: [
          { text: "a", isCorrect: true },
          { text: "b", isCorrect: true },
        ],
      })
    ).toThrow(/una opción correcta/i);

    expect(() =>
      questionInputSchema.parse({
        ...mcq,
        options: [
          { text: "a", isCorrect: false },
          { text: "b", isCorrect: false },
        ],
      })
    ).toThrow(/una opción correcta/i);
  });

  it("exige al menos dos opciones", () => {
    expect(() =>
      questionInputSchema.parse({ ...mcq, options: [{ text: "a", isCorrect: true }] })
    ).toThrow();
  });

  it("obliga a verdadero/falso a tener exactamente dos opciones", () => {
    expect(() =>
      questionInputSchema.parse({
        ...mcq,
        type: "true_false",
        options: [
          { text: "Verdadero", isCorrect: true },
          { text: "Falso", isCorrect: false },
          { text: "Depende", isCorrect: false },
        ],
      })
    ).toThrow(/verdadero\/falso/i);
  });
});
