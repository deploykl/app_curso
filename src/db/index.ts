import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const isTest = process.env.NODE_ENV === "test";
const url = (isTest ? process.env.TEST_DATABASE_URL : undefined) ?? process.env.DATABASE_URL!;

const client = postgres(url, { max: isTest ? 1 : 10 });

export const db = drizzle(client, { schema });
export type Db = typeof db;
