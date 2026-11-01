import { describe, expect, it, vi } from "vitest";
import {
  baseUrlOf,
  MRN_SYSTEM,
  rejectUnsupported,
  searchBundle,
  toFhirAppointment,
  toFhirPatient,
} from "@/fhir";
import type { Patient } from "@/patients";
import type { Appointment } from "@/schedule";

const patient: Patient = {
  id: "7d1f3a52-4c1e-4f0a-9a43-1b2c3d4e5f60",
  mrn: "100001",
  givenName: "Jane",
  familyName: "Doe",
  birthDate: "1980-01-01",
  gender: "female",
  phone: "217-555-0100",
  email: "jane.doe@example.com",
  addressLine: "100 Maple Street",
  city: "Springfield",
  state: "IL",
  postalCode: "62701",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
};

const appointment: Appointment = {
  id: "0b6e2f1c-8d3a-4e5b-9c7d-112233445566",
  patientId: patient.id,
  practitionerId: "5a4b3c2d-1e0f-4a9b-8c7d-665544332211",
  status: "booked",
  startsAt: new Date("2026-11-02T15:00:00Z"),
  endsAt: new Date("2026-11-02T15:30:00Z"),
  reason: "Annual physical",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  updatedAt: new Date("2026-11-01T00:00:00Z"),
};

describe("FHIR mapping", () => {
  it("maps a patient to a FHIR Patient", () => {
    expect(toFhirPatient(patient)).toMatchObject({
      resourceType: "Patient",
      id: patient.id,
      identifier: [{ system: MRN_SYSTEM, value: "100001" }],
      name: [{ family: "Doe", given: ["Jane"] }],
      gender: "female",
      birthDate: "1980-01-01",
      telecom: [
        { system: "phone", value: "217-555-0100" },
        { system: "email", value: "jane.doe@example.com" },
      ],
      address: [{ line: ["100 Maple Street"], city: "Springfield", state: "IL" }],
    });
  });

  it("leaves out empty contact details", () => {
    const resource = toFhirPatient({
      ...patient,
      phone: null,
      email: null,
      addressLine: null,
      city: null,
      state: null,
      postalCode: null,
    });
    expect(resource.telecom).toBeUndefined();
    expect(resource.address).toBeUndefined();
  });

  it("maps an appointment to a FHIR Appointment with references", () => {
    expect(toFhirAppointment(appointment)).toMatchObject({
      resourceType: "Appointment",
      status: "booked",
      start: "2026-11-02T15:00:00.000Z",
      end: "2026-11-02T15:30:00.000Z",
      minutesDuration: 30,
      reasonCode: [{ text: "Annual physical" }],
      participant: [
        { actor: { reference: `Patient/${patient.id}` } },
        { actor: { reference: `Practitioner/${appointment.practitionerId}` } },
      ],
    });
  });

  it("wraps search results in a searchset Bundle", () => {
    const bundle = searchBundle("http://localhost:3000/fhir", [toFhirPatient(patient)], 50);
    expect(bundle).toMatchObject({
      resourceType: "Bundle",
      type: "searchset",
      total: 1,
      entry: [{ fullUrl: `http://localhost:3000/fhir/Patient/${patient.id}` }],
    });
  });

  it("leaves out total when the page is full and there may be more", () => {
    const bundle = searchBundle("http://localhost:3000/fhir", [toFhirPatient(patient)], 1);
    expect(bundle.total).toBeUndefined();
  });
});

describe("FHIR requests", () => {
  it("builds links from the Host the client used", () => {
    const request = new Request("http://localhost:3000/fhir/Patient", {
      headers: { host: "core:3000" },
    });
    expect(baseUrlOf(request)).toBe("http://core:3000/fhir");
  });

  it("prefers FHIR_BASE_URL when it is set", () => {
    vi.stubEnv("FHIR_BASE_URL", "https://clinic.example.com/fhir/");
    expect(baseUrlOf(new Request("http://localhost:3000/fhir/Patient"))).toBe(
      "https://clinic.example.com/fhir",
    );
  });

  it("refuses search parameters it doesn't support", async () => {
    const params = new URLSearchParams("identifier=100005&_count=5");
    const response = rejectUnsupported(params, "Patient");
    expect(response?.status).toBe(400);
    expect(await response?.json()).toMatchObject({
      resourceType: "OperationOutcome",
      issue: [{ code: "not-supported", diagnostics: expect.stringContaining("identifier") }],
    });
    expect(rejectUnsupported(new URLSearchParams("name=doe&_count=5"), "Patient")).toBeNull();
  });
});
