import { clinic } from "@/config";
import {
  appointmentRequest,
  fhirResponse,
  notFound,
  operationOutcome,
  toFhirAppointment,
  writeResponse,
} from "@/fhir";
import { getAppointment, updateAppointment } from "@/schedule";
import { fhirContext } from "@/session";

// GET /fhir/Appointment/{id}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const appointment = await getAppointment(fhirContext(), id);
  if (!appointment) return notFound(`Appointment/${id} not found`);
  return fhirResponse(toFhirAppointment(appointment));
}

// PUT /fhir/Appointment/{id} cancels an appointment or moves it. Send the resource as a read
// returns it, with the status set to cancelled, or with a new time and Practitioner.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = fhirContext();
  return writeResponse(request, async (body) => {
    const change = await appointmentRequest(ctx, body, { timeZone: clinic.timeZone, id });
    const appointment = await updateAppointment(ctx, id, change, clinic.timeZone);
    // FHIR's answer when an update names a resource that doesn't exist and clients can't pick IDs.
    if (!appointment) {
      const outcome = operationOutcome("not-supported", `Appointment/${id} doesn't exist`);
      return fhirResponse(outcome, 405);
    }
    return fhirResponse(toFhirAppointment(appointment));
  });
}
