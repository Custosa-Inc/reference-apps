import { clinic } from "@/config";
import { fhirResponse, notFound, toFhirSlot } from "@/fhir";
import { getSlot } from "@/schedule";
import { fhirContext } from "@/session";

// GET /fhir/Slot/{id}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slot = await getSlot(fhirContext(), id, clinic.timeZone);
  if (!slot) return notFound(`Slot/${id} not found`);
  return fhirResponse(toFhirSlot(slot));
}
