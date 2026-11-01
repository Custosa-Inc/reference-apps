import { fhirResponse, notFound, toFhirPractitioner } from "@/fhir";
import { getPractitioner } from "@/practitioners";
import { fhirContext } from "@/session";

// GET /fhir/Practitioner/{id}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const practitioner = await getPractitioner(fhirContext(), id);
  if (!practitioner) return notFound(`Practitioner/${id} not found`);
  return fhirResponse(toFhirPractitioner(practitioner));
}
