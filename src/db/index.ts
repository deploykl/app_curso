import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const isTest = process.env.NODE_ENV === "test";
const url = (isTest ? process.env.TEST_DATABASE_URL : undefined) ?? process.env.DATABASE_URL!;

/*
  En desarrollo, cada recarga en caliente vuelve a evaluar este módulo. Sin
  cachear el cliente, cada recarga abría un pool nuevo de hasta 10 conexiones y
  las anteriores quedaban colgando hasta agotar los slots de Postgres
  ("las conexiones restantes están reservadas a roles con el atributo SUPERUSER").
  Guardarlo en globalThis hace que sobreviva a las recargas y se reutilice.
*/
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ?? postgres(url, { max: isTest ? 1 : 10 });

if (process.env.NODE_ENV !== "production") globalForDb.__pgClient = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
