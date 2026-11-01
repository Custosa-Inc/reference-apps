import { expect, it } from "vitest";
import { seedIfEmpty } from "@/db/seed";
import { searchPatients } from "@/patients";
import { createTestContext } from "./db";

it("seeds an empty database once", async () => {
  const ctx = await createTestContext();

  const made = await seedIfEmpty(ctx.db, "America/Chicago");
  expect(made).toMatchObject({ practitioners: 4, patients: 60 });
  expect(made!.appointments).toBeGreaterThan(0);

  expect(await seedIfEmpty(ctx.db, "America/Chicago")).toBeNull();
  expect(await searchPatients(ctx, { limit: 100 })).toHaveLength(60);
});
