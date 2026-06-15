import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// postgres.js connects lazily on first query, so an empty string here is safe
// for build/typecheck when DATABASE_URL isn't set; real queries need a valid URL.
const connectionString = process.env.DATABASE_URL ?? "";

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
