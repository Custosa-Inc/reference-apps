import { clinic } from "@/config";
import {
  appointmentRequest,
  badRequest,
  baseUrlOf,
  countParam,
  fhirResponse,
  rejectUnsupported,
  searchBundle,
  toFhirAppointment,
  writeResponse,
} from "@/fhir";
import { bookAppointment, listAppointments } from "@/schedule";
import { fhirContext } from "@/session";
import { isIsoDate } from "@/time";
import { z } from "zod";

// GET /fhir/Appointment?date=2026-11-02&patient=Patient/{id}
// `date` is a day in the clinic's time zone. Only the plain and "eq" forms are supported so far.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const refused = rejectUnsupported(params, "Appointment");
  if (refused) return refused;

  const dateParam = params.get("date")?.replace(/^eq/, "");
  if (dateParam !== undefined && !isIsoDate(dateParam)) {
    return badRequest("date must be a day in the form YYYY-MM-DD");
  }

  const patientParam = params.get("patient")?.replace(/^Patient\//, "");
  if (patientParam !== undefined && !z.uuid().safeParse(patientParam).success) {
    return badRequest("patient must be a Patient ID or a reference like Patient/{id}");
  }

  const limit = countParam(params);
  const appointments = await listAppointments(fhirContext(), {
    date: dateParam,
    patientId: patientParam,
    timeZone: clinic.timeZone,
    limit,
  });
  return fhirResponse(searchBundle(baseUrlOf(request), appointments.map(toFhirAppointment), limit));
}

// POST /fhir/Appointment books an appointment from a slot, or from a start, an end and a
// Practitioner. See appointmentRequest in src/fhir for what it reads.
export async function POST(request: Request) {
  const ctx = fhirContext();
  return writeResponse(request, async (body) => {
    const booking = await appointmentRequest(ctx, body, { timeZone: clinic.timeZone });
    const appointment = await bookAppointment(ctx, booking, clinic.timeZone);
    const response = fhirResponse(toFhirAppointment(appointment), 201);
    response.headers.set("location", `${baseUrlOf(request)}/Appointment/${appointment.id}`);
    return response;
  });
}
