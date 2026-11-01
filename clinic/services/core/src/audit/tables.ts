import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const auditActionEnum = pgEnum("audit_action", ["create", "read", "update", "delete"]);
// Where the request came from: the app's screens, the FHIR API, the seed script or a test.
export const auditSourceEnum = pgEnum("audit_source", ["ui", "fhir-api", "seed", "test"]);
export const auditEntityTypeEnum = pgEnum("audit_entity_type", ["Patient", "Appointment"]);

// Who read or changed patient data, and when. Loosely shaped like FHIR R4 AuditEvent.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    action: auditActionEnum("action").notNull(),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    source: auditSourceEnum("source").notNull(),
    entityType: auditEntityTypeEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    // Whose data it was. Lets the clinic answer "who has looked at this patient?"
    patientId: uuid("patient_id"),
  },
  (table) => [
    index("audit_events_patient_idx").on(table.patientId, table.recordedAt),
    index("audit_events_recorded_idx").on(table.recordedAt),
  ],
);
