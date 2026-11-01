import { fhirResponse, notFound, toFhirAppointment } from "@/fhir";
import { getAppointment } from "@/schedule";
import { fhirContext } from "@/session";

// GET /fhir/Appointment/{id}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appointment = await getAppointment(fhirContext(), id);
  if (!appointment) return notFound(`Appointment/${id} not found`);
  return fhirResponse(toFhirAppointment(appointment));
}
