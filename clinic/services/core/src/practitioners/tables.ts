import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Shaped like FHIR R4 Practitioner: https://hl7.org/fhir/R4/practitioner.html
export const practitioners = pgTable("practitioners", {
  id: uuid("id").primaryKey().defaultRandom(),
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  // Credentials shown after the name, such as "MD" or "NP".
  suffix: text("suffix"),
  specialty: text("specialty").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
