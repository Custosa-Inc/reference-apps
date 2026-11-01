import { desc, eq } from "drizzle-orm";
import type { Context } from "@/context";
import { auditEvents } from "./tables";

export type AuditEvent = typeof auditEvents.$inferSelect;

export type AuditEntry = Pick<AuditEvent, "action" | "entityType" | "entityId" | "patientId">;

/**
 * Records who read or changed patient data. Call it with the same Context as the read or change,
 * inside its transaction, so the two are saved together.
 */
export async function recordAudit(ctx: Context, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await ctx.db.insert(auditEvents).values(
    entries.map((entry) => ({
      ...entry,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      source: ctx.actor.source,
    })),
  );
}

export async function listAuditEvents(
  ctx: Context,
  filter: { patientId?: string; limit?: number } = {},
): Promise<AuditEvent[]> {
  return ctx.db
    .select()
    .from(auditEvents)
    .where(filter.patientId ? eq(auditEvents.patientId, filter.patientId) : undefined)
    .orderBy(desc(auditEvents.recordedAt))
    .limit(filter.limit ?? 100);
}
