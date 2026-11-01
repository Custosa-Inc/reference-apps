import {
  badRequest,
  baseUrlOf,
  countParam,
  fhirResponse,
  rejectUnsupported,
  searchBundle,
  toFhirSchedule,
} from "@/fhir";
import { getPractitioner, listPractitioners } from "@/practitioners";
import { fhirContext } from "@/session";
import { z } from "zod";

// GET /fhir/Schedule?actor=Practitioner/{id}
// Each practitioner has one schedule, with the practitioner's ID.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const refused = rejectUnsupported(params, "Schedule");
  if (refused) return refused;

  const actor = params.get("actor")?.replace(/^Practitioner\//, "");
  if (actor !== undefined && !z.uuid().safeParse(actor).success) {
    return badRequest("actor must be a Practitioner ID or a reference like Practitioner/{id}");
  }

  const ctx = fhirContext();
  const practitioners = actor
    ? [await getPractitioner(ctx, actor)].filter((p) => p !== null)
    : await listPractitioners(ctx);
  const limit = countParam(params);
  return fhirResponse(
    searchBundle(baseUrlOf(request), practitioners.slice(0, limit).map(toFhirSchedule), limit),
  );
}
