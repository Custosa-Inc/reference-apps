import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, type AuditEntry } from "@/audit";
import { inTransaction, type Context } from "@/context";
import { patients } from "./tables";

export type Patient = typeof patients.$inferSelect;
export type NewPatient = Omit<typeof patients.$inferInsert, "id" | "createdAt" | "updatedAt">;

function readEvent(patient: Patient): AuditEntry {
  return { action: "read", entityType: "Patient", entityId: patient.id, patientId: patient.id };
}

export async function createPatient(ctx: Context, input: NewPatient): Promise<Patient> {
  return inTransaction(ctx, async (tx) => {
    const [patient] = await tx.db.insert(patients).values(input).returning();
    await recordAudit(tx, [
      { action: "create", entityType: "Patient", entityId: patient.id, patientId: patient.id },
    ]);
    return patient;
  });
}

export async function getPatient(ctx: Context, id: string): Promise<Patient | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return inTransaction(ctx, async (tx) => {
    const [patient] = await tx.db.select().from(patients).where(eq(patients.id, id));
    if (!patient) return null;
    await recordAudit(tx, [readEvent(patient)]);
    return patient;
  });
}

/** Looks up several patients at once, keyed by ID. Missing IDs are left out. */
export async function getPatients(ctx: Context, ids: string[]): Promise<Map<string, Patient>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  return inTransaction(ctx, async (tx) => {
    const rows = await tx.db.select().from(patients).where(inArray(patients.id, unique));
    await recordAudit(tx, rows.map(readEvent));
    return new Map(rows.map((row) => [row.id, row]));
  });
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Finds patients whose given or family name starts with each word of `name`.
 * "jo sm" matches Jordan Smith.
 */
export async function searchPatients(
  ctx: Context,
  query: { name?: string; limit?: number },
): Promise<Patient[]> {
  const terms = (query.name ?? "").trim().split(/\s+/).filter(Boolean);
  const where = and(
    ...terms.map((term) =>
      or(
        ilike(patients.givenName, `${escapeLike(term)}%`),
        ilike(patients.familyName, `${escapeLike(term)}%`),
      ),
    ),
  );
  return inTransaction(ctx, async (tx) => {
    const rows = await tx.db
      .select()
      .from(patients)
      .where(where)
      .orderBy(asc(patients.familyName), asc(patients.givenName))
      .limit(query.limit ?? 50);
    await recordAudit(tx, rows.map(readEvent));
    return rows;
  });
}

export function fullName(patient: Pick<Patient, "givenName" | "familyName">): string {
  return `${patient.givenName} ${patient.familyName}`;
}
