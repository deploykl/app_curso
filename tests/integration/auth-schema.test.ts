import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";

async function tableExists(name: string) {
  const rows = await db.execute(
    sql`select 1 from information_schema.tables
        where table_schema = 'public' and table_name = ${name}`
  );
  return rows.length === 1;
}

describe("schema de autenticación", () => {
  it("creó las tablas de Better Auth", async () => {
    // Ajusta los nombres a lo que generó el CLI en el Step 4
    expect(await tableExists("user")).toBe(true);
    expect(await tableExists("session")).toBe(true);
    expect(await tableExists("account")).toBe(true);
    expect(await tableExists("verification")).toBe(true);
  });

  it("creó la tabla class_sessions en la Task 3", async () => {
    expect(await tableExists("class_sessions")).toBe(true);
  });
});
