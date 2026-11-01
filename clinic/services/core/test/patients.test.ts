import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/audit";
import type { Context } from "@/context";
import { createPatient, getPatient, searchPatients } from "@/patients";
import { patients } from "@/patients/tables";
import { createTestContext } from "./db";

let ctx: Context;

beforeAll(async () => {
  ctx = await createTestContext();
  for (const [givenName, familyName] of [
    ["Jordan", "Smith"],
    ["Maria", "Smithers"],
    ["Wei", "Chen"],
    ["Ana", "100%_Real"],
  ]) {
    await createPatient(ctx, { givenName, familyName, birthDate: "1990-05-05", gender: "unknown" });
  }
});

describe("patients", () => {
  it("gives each new patient a medical record number", async () => {
    const [first, second] = await searchPatients(ctx, { name: "smith" });
    expect(first.mrn).toMatch(/^\d{6}$/);
    expect(second.mrn).not.toBe(first.mrn);
  });

  it("matches the start of each word in the search", async () => {
    const names = (await searchPatients(ctx, { name: "smith" })).map((p) => p.familyName);
    expect(names).toEqual(["Smith", "Smithers"]);

    const both = await searchPatients(ctx, { name: "jo sm" });
    expect(both.map((p) => p.givenName)).toEqual(["Jordan"]);
  });

  it("treats % and _ in a search as plain characters", async () => {
    expect(await searchPatients(ctx, { name: "%" })).toEqual([]);
    expect(await searchPatients(ctx, { name: "100%_" })).toHaveLength(1);
  });

  it("records a read when a patient is opened", async () => {
    const [chen] = await searchPatients(ctx, { name: "chen" });
    await getPatient(ctx, chen.id);

    const events = await listAuditEvents(ctx, { patientId: chen.id });
    expect(events.map((e) => e.action)).toEqual(["read", "read", "create"]);
  });

  it("returns null for a patient that doesn't exist", async () => {
    expect(await getPatient(ctx, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("saves nothing when the audit event can't be saved", async () => {
    const broken = await createTestContext();
    await broken.db.execute(sql`DROP TABLE audit_events`);

    await expect(
      createPatient(broken, {
        givenName: "Jane",
        familyName: "Doe",
        birthDate: "1980-01-01",
        gender: "female",
      }),
    ).rejects.toThrow();
    expect(await broken.db.select().from(patients)).toEqual([]);
  });
});
