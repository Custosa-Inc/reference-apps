import type { Context } from "@/context";
import { pgliteConnection } from "@/db/client";

/** A fresh, migrated in-memory Postgres for one test file. */
export async function createTestContext(): Promise<Context> {
  const { db, migrate } = pgliteConnection();
  await migrate();
  return { db, actor: { id: "test-user", name: "Test user", source: "test" } };
}
