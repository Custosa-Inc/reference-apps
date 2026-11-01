import type { AuditEvent } from "./audit";
import type { Db } from "./db/client";

/** Who is acting. Every audit event records it. */
export type Actor = {
  id: string;
  name: string;
  source: AuditEvent["source"];
};

/** Passed to every function that reads or changes data. */
export type Context = {
  db: Db;
  actor: Actor;
};

/** Runs fn in a database transaction, so a change and its audit event are saved together. */
export function inTransaction<T>(ctx: Context, fn: (ctx: Context) => Promise<T>): Promise<T> {
  return ctx.db.transaction((tx) => fn({ ...ctx, db: tx }));
}
