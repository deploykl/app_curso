import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

describe("conexión a la base de datos", () => {
  it("responde a una consulta trivial", async () => {
    const result = await db.execute(sql`select 1 as uno`);
    expect(result[0]).toEqual({ uno: 1 });
  });
});
