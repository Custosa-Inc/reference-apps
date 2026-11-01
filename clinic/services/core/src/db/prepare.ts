import { clinic } from "@/config";
import { connection } from "./client";
import { seedIfEmpty } from "./seed";

/**
 * Brings the database up to date and seeds it if it is empty. If that fails, the process stops
 * so Docker can restart it, instead of serving error pages.
 */
export async function prepareDatabase(): Promise<void> {
  try {
    const { db, migrate } = connection();
    await migrate();
    const made = await seedIfEmpty(db, clinic.timeZone);
    if (made) {
      console.log(
        `Seeded ${made.patients} patients, ${made.practitioners} practitioners and ${made.appointments} appointments.`,
      );
    }
  } catch (error) {
    console.error("Could not prepare the database:", error);
    process.exit(1);
  }
}
