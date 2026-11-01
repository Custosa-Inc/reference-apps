import type {
  Appointment as FhirAppointment,
  Bundle,
  CapabilityStatement,
  OperationOutcome,
  Patient as FhirPatient,
  Practitioner as FhirPractitioner,
  Resource,
} from "fhir/r4";
import type { Patient } from "@/patients";
import type { Practitioner } from "@/practitioners";
import type { Appointment } from "@/schedule";

// Turns clinic records into FHIR R4 resources. The tables already use FHIR's field names and codes,
// so most of this is renaming.

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

/**
 * Wraps search results. `total` must count every match, not just this page, so it is left out
 * when the results filled the page and there may be more.
 */
export function searchBundle(baseUrl: string, resources: Resource[], limit: number): Bundle {
  return {
    resourceType: "Bundle",
    type: "searchset",
    total: resources.length < limit ? resources.length : undefined,
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
            interaction: [{ code: "read" }, { code: "search-type" }],
            searchParam: [...SEARCH_PARAMS.Appointment],
          },
          { type: "Practitioner", interaction: [{ code: "read" }] },
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
