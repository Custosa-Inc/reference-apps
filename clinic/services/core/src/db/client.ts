import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";

export type Db = PgDatabase<PgQueryResultHKT>;

type Connection = { db: Db; migrate: () => Promise<void> };

const migrationsFolder = path.join(process.cwd(), "drizzle");

/** Postgres running inside Node. Without a data folder it lives in memory, as in the tests. */
export function pgliteConnection(dataDir?: string): Connection {
  const db = drizzlePglite(new PGlite({ dataDir, extensions: { btree_gist } }));
  return { db, migrate: () => migratePglite(db, { migrationsFolder }) };
}

function connect(): Connection {
  const url = process.env.DATABASE_URL;
  // Without DATABASE_URL, use PGlite so the app works without Docker.
  if (!url) return pgliteConnection(path.join(process.cwd(), ".data"));

  const pool = new pg.Pool({ connectionString: url });
  // Without a listener, a dropped idle connection (say, Postgres restarting) would crash the app.
  pool.on("error", (error) => console.error("Postgres connection error:", error.message));
  const db = drizzlePg(pool);
  return { db, migrate: () => migratePg(db, { migrationsFolder }) };
}

// Kept on globalThis so Next.js hot reloads reuse one connection pool.
const cache = globalThis as unknown as { clinicDb?: Connection };

export function connection(): Connection {
  cache.clinicDb ??= connect();
  return cache.clinicDb;
}
