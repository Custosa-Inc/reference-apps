import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "@/context";
import { practitioners } from "./tables";

// Practitioner records are staff data, not patient data, so reading them isn't audited.

export type Practitioner = typeof practitioners.$inferSelect;
export type NewPractitioner = Omit<typeof practitioners.$inferInsert, "id" | "createdAt">;

export async function createPractitioner(
  ctx: Context,
  input: NewPractitioner,
): Promise<Practitioner> {
  const [practitioner] = await ctx.db.insert(practitioners).values(input).returning();
  return practitioner;
}

export async function getPractitioner(ctx: Context, id: string): Promise<Practitioner | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [practitioner] = await ctx.db.select().from(practitioners).where(eq(practitioners.id, id));
  return practitioner ?? null;
}

export async function listPractitioners(ctx: Context): Promise<Practitioner[]> {
  return ctx.db
    .select()
    .from(practitioners)
    .orderBy(asc(practitioners.familyName), asc(practitioners.givenName));
}

/** "Amara Okafor, MD". */
export function displayName(practitioner: Practitioner): string {
  const name = `${practitioner.givenName} ${practitioner.familyName}`;
  return practitioner.suffix ? `${name}, ${practitioner.suffix}` : name;
}
