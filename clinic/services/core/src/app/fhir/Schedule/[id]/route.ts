import { fhirResponse, notFound, toFhirSchedule } from "@/fhir";
import { getPractitioner } from "@/practitioners";
import { fhirContext } from "@/session";

// GET /fhir/Schedule/{id}. A schedule's ID is its practitioner's ID.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const practitioner = await getPractitioner(fhirContext(), id);
  if (!practitioner) return notFound(`Schedule/${id} not found`);
  return fhirResponse(toFhirSchedule(practitioner));
}
