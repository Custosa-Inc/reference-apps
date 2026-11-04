import {
  baseUrlOf,
  countParam,
  fhirResponse,
  rejectUnsupported,
  searchBundle,
  toFhirPatient,
} from "@/fhir";
import { searchPatients } from "@/patients";
import { fhirContext } from "@/session";

// GET /fhir/Patient?name=smith
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const refused = rejectUnsupported(params, "Patient");
  if (refused) return refused;

  const limit = countParam(params);
  const patients = await searchPatients(fhirContext(), {
    name: params.get("name") ?? undefined,
    phone: params.get("telecom") ?? undefined,
    limit,
  });
  return fhirResponse(searchBundle(baseUrlOf(request), patients.map(toFhirPatient), limit));
}
