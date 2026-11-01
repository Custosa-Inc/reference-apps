import type {
  Appointment as FhirAppointment,
  Bundle,
  CapabilityStatement,
  OperationOutcome,
  Patient as FhirPatient,
  Practitioner as FhirPractitioner,
  Resource,
  Schedule as FhirSchedule,
  Slot as FhirSlot,
} from "fhir/r4";
import { z } from "zod";
import type { Context } from "@/context";
import type { Patient } from "@/patients";
import { displayName, type Practitioner } from "@/practitioners";
import {
  APPOINTMENT_STATUSES,
  BOOKING_MESSAGES,
  BookingError,
  freeSlot,
  getSlot,
  type Appointment,
  type AppointmentChange,
  type Slot,
} from "@/schedule";
import { wallClockIn, zonedTimeToUtc } from "@/time";

// Turns clinic records into FHIR R4 resources, and reads the Appointments clients send. The tables
// already use FHIR's field names and codes, so most of this is renaming.

/** Identifier system for the clinic's medical record numbers. */
export const MRN_SYSTEM = "https://example.org/clinic/mrn";

export function toFhirPatient(patient: Patient): FhirPatient {
  const telecom: FhirPatient["telecom"] = [];
  if (patient.phone) telecom.push({ system: "phone", value: patient.phone, use: "home" });
  if (patient.email) telecom.push({ system: "email", value: patient.email });
  const hasAddress = patient.addressLine || patient.city || patient.state || patient.postalCode;

  return {
    resourceType: "Patient",
    id: patient.id,
    meta: { lastUpdated: patient.updatedAt.toISOString() },
    identifier: [
      {
        use: "usual",
        type: {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/v2-0203",
              code: "MR",
              display: "Medical record number",
            },
          ],
        },
        system: MRN_SYSTEM,
        value: patient.mrn,
      },
    ],
    active: true,
    name: [{ use: "official", family: patient.familyName, given: [patient.givenName] }],
    telecom: telecom.length > 0 ? telecom : undefined,
    gender: patient.gender,
    birthDate: patient.birthDate,
    address: hasAddress
      ? [
          {
            use: "home",
            line: patient.addressLine ? [patient.addressLine] : undefined,
            city: patient.city ?? undefined,
            state: patient.state ?? undefined,
            postalCode: patient.postalCode ?? undefined,
            country: "US",
          },
        ]
      : undefined,
  };
}

export function toFhirPractitioner(practitioner: Practitioner): FhirPractitioner {
  return {
    resourceType: "Practitioner",
    id: practitioner.id,
    active: true,
    name: [
      {
        use: "official",
        family: practitioner.familyName,
        given: [practitioner.givenName],
        suffix: practitioner.suffix ? [practitioner.suffix] : undefined,
      },
    ],
  };
}

export function toFhirAppointment(appointment: Appointment): FhirAppointment {
  return {
    resourceType: "Appointment",
    id: appointment.id,
    meta: { lastUpdated: appointment.updatedAt.toISOString() },
    status: appointment.status,
    reasonCode: appointment.reason ? [{ text: appointment.reason }] : undefined,
    start: appointment.startsAt.toISOString(),
    end: appointment.endsAt.toISOString(),
    minutesDuration: Math.round(
      (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
    ),
    participant: [
      { actor: { reference: `Patient/${appointment.patientId}` }, status: "accepted" },
      { actor: { reference: `Practitioner/${appointment.practitionerId}` }, status: "accepted" },
    ],
  };
}

/** Each practitioner has one schedule, and it has the practitioner's ID. */
export function toFhirSchedule(practitioner: Practitioner): FhirSchedule {
  return {
    resourceType: "Schedule",
    id: practitioner.id,
    active: true,
    actor: [{ reference: `Practitioner/${practitioner.id}`, display: displayName(practitioner) }],
  };
}

export function toFhirSlot(slot: Slot): FhirSlot {
  return {
    resourceType: "Slot",
    id: slot.id,
    schedule: { reference: `Schedule/${slot.practitionerId}` },
    status: slot.status,
    start: slot.startsAt.toISOString(),
    end: slot.endsAt.toISOString(),
  };
}

/** A resource the server can't read. The message is safe to send back. */
export class InvalidResourceError extends Error {
  name = "InvalidResourceError";
}

const reference = z.strictObject(
  { reference: z.string(), display: z.string().optional() },
  "must be a reference",
);
const instant = z.iso.datetime({ offset: true, error: "must be a date and time with a time zone" });

// The parts of an Appointment the clinic stores. Anything else is refused rather than dropped,
// except meta and minutesDuration, which the server works out itself.
const appointmentResource = z.strictObject({
  resourceType: z.literal("Appointment", "must be Appointment"),
  id: z.string().optional(),
  meta: z.unknown().optional(),
  status: z.enum(APPOINTMENT_STATUSES, "must be a FHIR appointment status"),
  start: instant.optional(),
  end: instant.optional(),
  minutesDuration: z.unknown().optional(),
  slot: z.array(reference).length(1, "must name one slot").optional(),
  reasonCode: z
    .array(z.strictObject({ text: z.string() }))
    .max(1, "may have one reason")
    .optional(),
  participant: z.array(
    z.strictObject({
      actor: reference,
      status: z.literal("accepted", "must be accepted").optional(),
    }),
  ),
});

/**
 * Reads an Appointment a client sent into the fields the clinic books with. It names one Patient,
 * and either a slot or a start, an end and a Practitioner. For an update, `id` is the one in the URL.
 */
export async function appointmentRequest(
  ctx: Context,
  body: unknown,
  options: { timeZone: string; id?: string; now?: Date },
): Promise<AppointmentChange> {
  const parsed = appointmentResource.safeParse(body);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    const where = issue.path.join(".");
    if (issue.code === "unrecognized_keys") {
      const keys = issue.keys.map((key) => (where ? `${where}.${key}` : key));
      throw new InvalidResourceError(`Not supported: ${keys.join(", ")}`);
    }
    throw new InvalidResourceError(
      where ? `${where} ${issue.message}` : "The body must be a FHIR Appointment in JSON",
    );
  }
  const resource = parsed.data;
  if (options.id === undefined && resource.status !== "booked") {
    throw new InvalidResourceError("A new appointment's status must be booked");
  }
  if (options.id !== undefined && resource.id !== options.id) {
    throw new InvalidResourceError("The resource's id must match the URL");
  }

  const patients: string[] = [];
  const practitioners: string[] = [];
  for (const { actor } of resource.participant) {
    const match = /^(Patient|Practitioner)\/([^/]+)$/.exec(actor.reference);
    if (!match) {
      throw new InvalidResourceError("participant can only be a Patient or a Practitioner");
    }
    (match[1] === "Patient" ? patients : practitioners).push(match[2]);
  }
  if (patients.length !== 1) throw new InvalidResourceError("participant must include one Patient");
  if (practitioners.length > 1) {
    throw new InvalidResourceError("participant may include one Practitioner");
  }

  let practitionerId = practitioners[0];
  let start = resource.start ? new Date(resource.start) : undefined;
  let end = resource.end ? new Date(resource.end) : undefined;

  const slotReference = resource.slot?.[0].reference;
  if (slotReference) {
    if (!slotReference.startsWith("Slot/")) {
      throw new InvalidResourceError("slot must be a reference like Slot/{id}");
    }
    // An update may name the slot its own appointment holds, so it only needs the slot to exist.
    // The database still refuses a clash with any other appointment.
    const slotId = slotReference.slice(5);
    const slot =
      options.id === undefined
        ? await freeSlot(ctx, slotId, options.timeZone, options.now)
        : await getSlot(ctx, slotId, options.timeZone, options.now);
    if (!slot) throw new BookingError(BOOKING_MESSAGES.noSlot);
    if (
      (practitionerId && practitionerId !== slot.practitionerId) ||
      (start && start.getTime() !== slot.startsAt.getTime()) ||
      (end && end.getTime() !== slot.endsAt.getTime())
    ) {
      throw new InvalidResourceError("start, end and the Practitioner must match the slot");
    }
    ({ practitionerId, startsAt: start, endsAt: end } = slot);
  }

  if (!start || !end || !practitionerId) {
    throw new InvalidResourceError(
      "Send a slot, or a start, an end and a Practitioner participant",
    );
  }
  if (start.getTime() % 60_000 !== 0 || end.getTime() % 60_000 !== 0) {
    throw new InvalidResourceError("start and end must be on a whole minute");
  }
  // The clinic books by wall-clock time. On the night clocks go back, one hour happens twice, so a
  // start in it can't be told apart from the same time an hour earlier.
  const { date, time } = wallClockIn(start, options.timeZone);
  if (zonedTimeToUtc(date, time, options.timeZone).getTime() !== start.getTime()) {
    throw new InvalidResourceError("start can't fall in the hour that repeats when clocks go back");
  }
  return {
    status: resource.status,
    patientId: patients[0],
    practitionerId,
    date,
    time,
    minutes: (end.getTime() - start.getTime()) / 60_000,
    reason: resource.reasonCode?.[0]?.text,
  };
}

const JSON_TYPES = ["application/fhir+json", "application/json"];

/**
 * Reads the resource a client sent and runs a create or update with it. Only JSON bodies are read.
 * A browser checks with the server before sending JSON to another site, and this server never
 * agrees, so a web page on another site can't use a visitor's browser to write to the clinic. A
 * resource the server can't read gets a 400, and one the clinic's rules refuse gets a 422, each with
 * an OperationOutcome that says why.
 */
export async function writeResponse(
  request: Request,
  write: (body: unknown) => Promise<Response>,
): Promise<Response> {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!type || !JSON_TYPES.includes(type)) {
    const outcome = operationOutcome("not-supported", "Send the resource as application/fhir+json");
    return fhirResponse(outcome, 415);
  }
  const body = await request.json().catch(() => null);
  try {
    return await write(body);
  } catch (error) {
    if (error instanceof InvalidResourceError) return badRequest(error.message);
    if (error instanceof BookingError) {
      return fhirResponse(operationOutcome("business-rule", error.message), 422);
    }
    throw error;
  }
}

/**
 * Wraps search results. `total` must count every match, not just this page. Pass it when the search
 * knows it; otherwise it is left out when the results filled the page and there may be more.
 */
export function searchBundle(
  baseUrl: string,
  resources: Resource[],
  limit: number,
  total?: number,
): Bundle {
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: total ?? (resources.length < limit ? resources.length : undefined),
    entry: resources.map((resource) => ({
      fullUrl: `${baseUrl}/${resource.resourceType}/${resource.id}`,
      resource,
      search: { mode: "match" },
    })),
  };
}

export function operationOutcome(
  code: OperationOutcome["issue"][number]["code"],
  diagnostics: string,
): OperationOutcome {
  return { resourceType: "OperationOutcome", issue: [{ severity: "error", code, diagnostics }] };
}

// The search parameters each resource supports. The routes and the CapabilityStatement share it.
const SEARCH_PARAMS = {
  Patient: [{ name: "name", type: "string" }],
  Appointment: [
    { name: "date", type: "date" },
    { name: "patient", type: "reference" },
  ],
  Schedule: [{ name: "actor", type: "reference" }],
  Slot: [
    { name: "schedule", type: "reference" },
    { name: "start", type: "date" },
    { name: "status", type: "token" },
  ],
} as const;

export function capabilityStatement(baseUrl: string): CapabilityStatement {
  return {
    resourceType: "CapabilityStatement",
    status: "active",
    date: "2026-11-01",
    kind: "instance",
    software: { name: "reference-apps clinic" },
    implementation: { description: "Mock outpatient clinic with synthetic data", url: baseUrl },
    fhirVersion: "4.0.1",
    format: ["application/fhir+json"],
    rest: [
      {
        mode: "server",
        security: { description: "No sign-in yet. Use only with synthetic data." },
        resource: [
          {
            type: "Patient",
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [...SEARCH_PARAMS.Patient],
          },
          {
            type: "Appointment",
            interaction: [
              { code: "read" },
              { code: "search-type" },
              { code: "create" },
              { code: "update" },
            ],
            updateCreate: false,
            searchParam: [...SEARCH_PARAMS.Appointment],
          },
          { type: "Practitioner", interaction: [{ code: "read" }] },
          {
            type: "Schedule",
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [...SEARCH_PARAMS.Schedule],
          },
          {
            type: "Slot",
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [...SEARCH_PARAMS.Slot],
          },
        ],
      },
    ],
  };
}

/** A JSON response with FHIR's media type. */
export function fhirResponse(resource: Resource, status = 200): Response {
  return new Response(JSON.stringify(resource, null, 2), {
    status,
    headers: { "content-type": "application/fhir+json; charset=utf-8" },
  });
}

export function notFound(diagnostics: string): Response {
  return fhirResponse(operationOutcome("not-found", diagnostics), 404);
}

export function badRequest(diagnostics: string): Response {
  return fhirResponse(operationOutcome("invalid", diagnostics), 400);
}

/**
 * The FHIR base URL for links in responses, such as http://localhost:3000/fhir. Set FHIR_BASE_URL
 * when the app sits behind a proxy; otherwise it follows the Host header the client used, so a
 * service calling http://core:3000/fhir gets links it can follow.
 */
export function baseUrlOf(request: Request): string {
  const configured = process.env.FHIR_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${protocol}://${host}/fhir`;
}

/**
 * Refuses search parameters this server doesn't support. Ignoring them would quietly return the
 * wrong records, such as every patient for an identifier search.
 */
export function rejectUnsupported(
  params: URLSearchParams,
  resourceType: keyof typeof SEARCH_PARAMS,
): Response | null {
  const allowed = new Set(["_count", "_format", ...SEARCH_PARAMS[resourceType].map((p) => p.name)]);
  const unsupported = [...new Set(params.keys())].filter((name) => !allowed.has(name));
  if (unsupported.length === 0) return null;
  return fhirResponse(
    operationOutcome(
      "not-supported",
      `Unsupported search parameter: ${unsupported.join(", ")}. Supported: ${[...allowed].join(", ")}`,
    ),
    400,
  );
}

/** Reads `_count`, capped at 100. */
export function countParam(params: URLSearchParams): number {
  const value = Number(params.get("_count") ?? 50);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : 50;
}
