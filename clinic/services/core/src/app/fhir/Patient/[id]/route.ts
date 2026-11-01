import { fhirResponse, notFound, toFhirPatient } from "@/fhir";
import { getPatient } from "@/patients";
import { fhirContext } from "@/session";

// GET /fhir/Patient/{id}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await getPatient(fhirContext(), id);
  if (!patient) return notFound(`Patient/${id} not found`);
  return fhirResponse(toFhirPatient(patient));
}
