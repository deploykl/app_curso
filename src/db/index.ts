import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!;

const client = postgres(url, { max: process.env.TEST_DATABASE_URL ? 1 : 10 });

export const db = drizzle(client, { schema });
export type Db = typeof db;
