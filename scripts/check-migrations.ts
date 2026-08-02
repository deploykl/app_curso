import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://appcurso:appcurso@localhost:5432/appcurso");

async function main() {
  try {
    const rows = await sql`select id, hash, created_at from drizzle.__drizzle_migrations order by id`;
    console.log(rows);
  } catch (e) {
    console.error("query error:", e);
  }
  const hasActive = await sql`select column_name from information_schema.columns where table_name = 'user' and column_name = 'active'`;
  console.log("has active column:", hasActive);
  await sql.end();
}

main();
