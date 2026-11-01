import { sql } from "drizzle-orm";
import { date, pgEnum, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const patientMrnSequence = pgSequence("patient_mrn_seq", { startWith: 100001 });

// FHIR R4 AdministrativeGender: https://hl7.org/fhir/R4/valueset-administrative-gender.html
export const genderEnum = pgEnum("gender", ["male", "female", "other", "unknown"]);

// Shaped like FHIR R4 Patient: https://hl7.org/fhir/R4/patient.html
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Medical record number, the ID the front desk reads out and prints on forms.
  mrn: text("mrn")
    .notNull()
    .unique()
    .default(sql`nextval('patient_mrn_seq')::text`),
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  birthDate: date("birth_date").notNull(),
  gender: genderEnum("gender").notNull(),
  phone: text("phone"),
  email: text("email"),
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
