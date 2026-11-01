import { inTransaction, type Actor, type Context } from "@/context";
import { createPatient, type NewPatient, type Patient } from "@/patients";
import { createPractitioner, listPractitioners, type NewPractitioner } from "@/practitioners";
import { bookAppointment, SLOT_TIMES } from "@/schedule";
import { addDays, dayOfWeek, todayIn } from "@/time";
import type { Db } from "./client";

// Everything here is made up. Phone numbers use the fictional 555-01xx range and emails use
// example.com, so no record can belong to a real person.

const SEED_ACTOR: Actor = { id: "seed", name: "Seed script", source: "seed" };

const words = (text: string) => text.trim().split(/\s+/);

const FEMALE_NAMES = words(`
  Mary Patricia Jennifer Linda Elizabeth Maria Aisha Priya Mei Fatima Sofia Grace Hannah Emily
  Olivia Ava Chloe Nia Rosa Leila
`);
const MALE_NAMES = words(`
  James Robert Michael David William Jose Ahmed Raj Wei Daniel Samuel Lucas Ethan Noah Omar
  Kwame Diego Thomas Hiroshi Carlos
`);
const NEUTRAL_NAMES = words("Alex Jordan Taylor Riley Casey");
const FAMILY_NAMES = words(`
  Smith Johnson Williams Brown Jones Garcia Miller Davis Rodriguez Martinez Hernandez Lopez
  Gonzalez Wilson Anderson Thomas Taylor Moore Jackson Martin Lee Perez Thompson White Harris
  Sanchez Clark Ramirez Lewis Robinson Walker Young Allen King Wright Scott Torres Nguyen Hill
  Flores Green Adams Nelson Baker Hall Rivera Campbell Mitchell Carter Roberts Patel Kim Chen
  Okafor Khan
`);
const STREETS = [
  "Maple Street",
  "Oak Avenue",
  "Cedar Lane",
  "Elm Street",
  "Lincoln Road",
  "Washington Avenue",
  "Park Drive",
  "Lakeview Court",
];
const REASONS = [
  "Annual physical",
  "Follow-up visit",
  "Sick visit",
  "Blood pressure check",
  "Medication review",
  "New patient visit",
  "Vaccination",
  "Lab results review",
];

const PRACTITIONERS: (NewPractitioner & { seesChildren: boolean })[] = [
  {
    givenName: "Amara",
    familyName: "Okafor",
    suffix: "MD",
    specialty: "Family medicine",
    seesChildren: false,
  },
  {
    givenName: "Daniel",
    familyName: "Reyes",
    suffix: "MD",
    specialty: "Internal medicine",
    seesChildren: false,
  },
  {
    givenName: "Mei",
    familyName: "Lin",
    suffix: "MD",
    specialty: "Pediatrics",
    seesChildren: true,
  },
  {
    givenName: "Jordan",
    familyName: "Patel",
    suffix: "NP",
    specialty: "Family medicine",
    seesChildren: false,
  },
];

/** A small seeded random number generator (mulberry32), so every seed run makes the same data. */
function randomGenerator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
  return { next, int, pick };
}

function makePatient(random: ReturnType<typeof randomGenerator>, index: number): NewPatient {
  const roll = random.next();
  const [givenName, gender]: [string, NewPatient["gender"]] =
    roll < 0.47
      ? [random.pick(FEMALE_NAMES), "female"]
      : roll < 0.94
        ? [random.pick(MALE_NAMES), "male"]
        : [random.pick(NEUTRAL_NAMES), random.next() < 0.5 ? "other" : "unknown"];
  const familyName = random.pick(FAMILY_NAMES);
  const birthDate = addDays("1940-01-01", random.int(0, 30_000));
  return {
    givenName,
    familyName,
    gender,
    birthDate,
    phone: `217-555-01${String(index % 100).padStart(2, "0")}`,
    email: `${givenName}.${familyName}${index}@example.com`.toLowerCase(),
    addressLine: `${random.int(100, 9999)} ${random.pick(STREETS)}`,
    city: "Springfield",
    state: "IL",
    postalCode: `627${String(random.int(1, 12)).padStart(2, "0")}`,
  };
}

function isChild(patient: Patient, today: string): boolean {
  return patient.birthDate > addDays(today, -18 * 365);
}

/** Fills an empty database with practitioners, patients and two weeks of appointments. */
async function seed(ctx: Context, timeZone: string) {
  const random = randomGenerator(42);
  const today = todayIn(timeZone);

  const practitioners = [];
  for (const { seesChildren, ...input } of PRACTITIONERS) {
    practitioners.push({ seesChildren, record: await createPractitioner(ctx, input) });
  }

  const patients: Patient[] = [];
  for (let i = 0; i < 60; i++) patients.push(await createPatient(ctx, makePatient(random, i)));
  const children = patients.filter((p) => isChild(p, today));
  const adults = patients.filter((p) => !isChild(p, today));

  let appointments = 0;
  for (let day = 0; day < 14; day++) {
    const date = addDays(today, day);
    if (dayOfWeek(date) === 0 || dayOfWeek(date) === 6) continue;
    for (const { seesChildren, record } of practitioners) {
      const pool = seesChildren ? children : adults;
      if (pool.length === 0) continue;
      for (const time of SLOT_TIMES) {
        if (random.next() > 0.6) continue;
        await bookAppointment(
          ctx,
          {
            patientId: random.pick(pool).id,
            practitionerId: record.id,
            date,
            time,
            minutes: 30,
            reason: random.pick(REASONS),
          },
          timeZone,
        );
        appointments++;
      }
    }
  }

  return { practitioners: practitioners.length, patients: patients.length, appointments };
}

/** Seeds the database only if it has no patients yet. Returns what it made, or null. */
export async function seedIfEmpty(db: Db, timeZone: string) {
  // One transaction, so a seed interrupted halfway leaves nothing behind and runs again next time.
  return inTransaction({ db, actor: SEED_ACTOR }, async (ctx) => {
    if ((await listPractitioners(ctx)).length > 0) return null;
    return seed(ctx, timeZone);
  });
}
