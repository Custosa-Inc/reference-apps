import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { patients } from "../patients/tables";
import { practitioners } from "../practitioners/tables";

// FHIR R4 Appointment status codes: https://hl7.org/fhir/R4/valueset-appointmentstatus.html
export const appointmentStatusEnum = pgEnum("appointment_status", [
  "proposed",
  "pending",
  "booked",
  "arrived",
  "fulfilled",
  "cancelled",
  "noshow",
  "entered-in-error",
  "checked-in",
  "waitlist",
]);

// Shaped like FHIR R4 Appointment: https://hl7.org/fhir/R4/appointment.html
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    practitionerId: uuid("practitioner_id")
      .notNull()
      .references(() => practitioners.id),
    status: appointmentStatusEnum("status").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("appointments_ends_after_start", sql`${table.endsAt} > ${table.startsAt}`),
    index("appointments_practitioner_starts_idx").on(table.practitionerId, table.startsAt),
    index("appointments_patient_idx").on(table.patientId),
  ],
);
