import type { Actor, Context } from "@/context";
import { connection } from "@/db/client";

// There is no sign-in yet. Every screen acts as one demo user, and the FHIR API is open.
// Replacing these with real users is open work; see the clinic README.

export const DEMO_USER: Actor = { id: "demo-front-desk", name: "Front desk (demo)", source: "ui" };

const FHIR_CLIENT: Actor = {
  id: "fhir-api-client",
  name: "FHIR API client (no sign-in yet)",
  source: "fhir-api",
};

/** Context for a request from the app's screens. */
export function requestContext(): Context {
  return { db: connection().db, actor: DEMO_USER };
}

/** Context for a request to the FHIR API. */
export function fhirContext(): Context {
  return { db: connection().db, actor: FHIR_CLIENT };
}
