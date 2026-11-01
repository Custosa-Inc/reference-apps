import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Context } from "@/context";
import {
  appointmentRequest,
  baseUrlOf,
  capabilityStatement,
  InvalidResourceError,
  MRN_SYSTEM,
  rejectUnsupported,
  searchBundle,
  toFhirAppointment,
  toFhirPatient,
  toFhirSchedule,
  toFhirSlot,
  writeResponse,
} from "@/fhir";
import { createPatient, type Patient } from "@/patients";
import { createPractitioner, type Practitioner } from "@/practitioners";
import { BookingError, bookAppointment, listSlots, type Appointment, type Slot } from "@/schedule";
import { createTestContext } from "./db";

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

  it("gives each practitioner a FHIR Schedule with the practitioner's ID", () => {
    const practitioner: Practitioner = {
      id: appointment.practitionerId,
      givenName: "Amara",
      familyName: "Okafor",
      suffix: "MD",
      specialty: "Family medicine",
      createdAt: new Date("2026-11-01T00:00:00Z"),
    };
    expect(toFhirSchedule(practitioner)).toEqual({
      resourceType: "Schedule",
      id: practitioner.id,
      active: true,
      actor: [{ reference: `Practitioner/${practitioner.id}`, display: "Amara Okafor, MD" }],
    });
  });

  it("maps a slot to a FHIR Slot on its practitioner's schedule", () => {
    const slot: Slot = {
      id: `${appointment.practitionerId}-202611020900`,
      practitionerId: appointment.practitionerId,
      startsAt: new Date("2026-11-02T15:00:00Z"),
      endsAt: new Date("2026-11-02T15:30:00Z"),
      status: "free",
    };
    expect(toFhirSlot(slot)).toEqual({
      resourceType: "Slot",
      id: slot.id,
      schedule: { reference: `Schedule/${appointment.practitionerId}` },
      status: "free",
      start: "2026-11-02T15:00:00.000Z",
      end: "2026-11-02T15:30:00.000Z",
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

  it("gives the full count when the search knows it", () => {
    const bundle = searchBundle("http://localhost:3000/fhir", [toFhirPatient(patient)], 1, 60);
    expect(bundle.total).toBe(60);
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

  it("lists booking, slots and schedules in the CapabilityStatement", () => {
    const resources = capabilityStatement("http://localhost:3000/fhir").rest![0].resource!;
    const interactions = Object.fromEntries(
      resources.map((r) => [r.type, r.interaction!.map((i) => i.code)]),
    );
    expect(interactions).toMatchObject({
      Appointment: ["read", "search-type", "create", "update"],
      Schedule: ["read", "search-type"],
      Slot: ["read", "search-type"],
    });
  });

  const post = (contentType: string | null, body = '{"resourceType":"Appointment"}') =>
    new Request("http://localhost/fhir/Appointment", {
      method: "POST",
      headers: contentType ? { "content-type": contentType } : {},
      body,
    });

  it("answers 400 to a resource it can't read and 422 to one the clinic refuses", async () => {
    const unreadable = await writeResponse(post("application/fhir+json"), async () => {
      throw new InvalidResourceError("Expected an Appointment");
    });
    const refused = await writeResponse(post("application/fhir+json"), async () => {
      throw new BookingError("That slot isn't free.");
    });
    expect(unreadable.status).toBe(400);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({
      issue: [{ code: "business-rule", diagnostics: "That slot isn't free." }],
    });
  });

  it("reads FHIR JSON and plain JSON bodies", async () => {
    for (const type of ["application/fhir+json; charset=utf-8", "application/json"]) {
      const response = await writeResponse(post(type), async (body) => Response.json(body));
      expect(await response.json()).toEqual({ resourceType: "Appointment" });
    }
  });

  it("refuses bodies that aren't JSON, which web pages on other sites could send", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", null]) {
      let wrote = false;
      const response = await writeResponse(post(type), async () => {
        wrote = true;
        return new Response();
      });
      expect(response.status).toBe(415);
      expect(wrote).toBe(false);
    }
  });
});

describe("reading an Appointment a client sends", () => {
  const TZ = "America/Chicago";
  const before = new Date("2026-12-01T00:00:00Z"); // earlier than every slot below
  let ctx: Context;
  let patientId: string;
  let practitionerId: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    patientId = (
      await createPatient(ctx, {
        givenName: "Jane",
        familyName: "Doe",
        birthDate: "1980-01-01",
        gender: "female",
      })
    ).id;
    practitionerId = (
      await createPractitioner(ctx, {
        givenName: "Amara",
        familyName: "Okafor",
        specialty: "Family medicine",
      })
    ).id;
  });

  const patient = () => ({ actor: { reference: `Patient/${patientId}` } });
  const doctor = () => ({ actor: { reference: `Practitioner/${practitionerId}` } });

  function read(fields: Record<string, unknown>, id?: string) {
    const body = {
      resourceType: "Appointment",
      status: "booked",
      participant: [patient()],
      ...fields,
    };
    return appointmentRequest(ctx, body, { timeZone: TZ, id, now: before });
  }

  it("books from a slot", async () => {
    const [slot] = await listSlots(ctx, { date: "2026-12-07", timeZone: TZ, now: before });
    const change = await read({
      slot: [{ reference: `Slot/${slot.id}` }],
      reasonCode: [{ text: "Checkup" }],
    });
    expect(change).toEqual({
      status: "booked",
      patientId,
      practitionerId,
      date: "2026-12-07",
      time: "08:30",
      minutes: 30,
      reason: "Checkup",
    });
  });

  it("books from a start, an end and a practitioner", async () => {
    const change = await read({
      start: "2026-12-07T09:00:00-06:00",
      end: "2026-12-07T09:45:00-06:00",
      participant: [patient(), doctor()],
    });
    expect(change).toMatchObject({
      practitionerId,
      date: "2026-12-07",
      time: "09:00",
      minutes: 45,
    });
  });

  it("needs a slot, or a start, an end and a practitioner", async () => {
    await expect(read({ start: "2026-12-07T09:00:00-06:00" })).rejects.toThrow(
      "Send a slot, or a start, an end and a Practitioner participant",
    );
  });

  it("refuses a start, end or practitioner that doesn't match the slot", async () => {
    const [slot] = await listSlots(ctx, { date: "2026-12-08", timeZone: TZ, now: before });
    await expect(
      read({ slot: [{ reference: `Slot/${slot.id}` }], start: "2026-12-08T10:00:00-06:00" }),
    ).rejects.toThrow("start, end and the Practitioner must match the slot");
  });

  it("only creates booked appointments", async () => {
    await expect(
      read({
        status: "proposed",
        start: "2026-12-07T10:00:00-06:00",
        end: "2026-12-07T10:30:00-06:00",
        participant: [patient(), doctor()],
      }),
    ).rejects.toThrow("A new appointment's status must be booked");
  });

  it("needs exactly one patient", async () => {
    await expect(read({ participant: [doctor()] })).rejects.toThrow(
      "participant must include one Patient",
    );
  });

  it("refuses times that aren't on a whole minute", async () => {
    await expect(
      read({
        start: "2026-12-07T09:00:30-06:00",
        end: "2026-12-07T09:30:00-06:00",
        participant: [patient(), doctor()],
      }),
    ).rejects.toThrow("start and end must be on a whole minute");
  });

  it("refuses an empty slot list", async () => {
    await expect(read({ slot: [] })).rejects.toThrow("slot must name one slot");
  });

  it("refuses fields it doesn't store", async () => {
    await expect(
      read({
        start: "2026-12-07T11:00:00-06:00",
        end: "2026-12-07T11:30:00-06:00",
        participant: [patient(), doctor()],
        comment: "Bring insurance card",
      }),
    ).rejects.toThrow("Not supported: comment");
  });

  it("refuses participants other than a Patient and a Practitioner", async () => {
    await expect(
      read({ participant: [patient(), { actor: { reference: "Location/1" } }] }),
    ).rejects.toThrow("participant can only be a Patient or a Practitioner");
  });

  it("refuses a participant that hasn't accepted", async () => {
    await expect(read({ participant: [{ ...patient(), status: "declined" }] })).rejects.toThrow(
      "participant.0.status must be accepted",
    );
  });

  it("reads back an appointment as the API returns it", async () => {
    const appointment = await bookAppointment(
      ctx,
      { patientId, practitionerId, date: "2026-12-09", time: "09:00", minutes: 30 },
      TZ,
    );
    const resource = toFhirAppointment(appointment);
    await expect(
      appointmentRequest(ctx, resource, { timeZone: TZ, id: appointment.id }),
    ).resolves.toMatchObject({ date: "2026-12-09", time: "09:00", minutes: 30 });
  });

  it("lets an update name the slot its appointment already holds", async () => {
    const [slot] = await listSlots(ctx, { date: "2026-12-10", timeZone: TZ, now: before });
    const appointment = await bookAppointment(
      ctx,
      { patientId, practitionerId, date: "2026-12-10", time: "08:30", minutes: 30 },
      TZ,
    );
    await expect(
      read({ id: appointment.id, slot: [{ reference: `Slot/${slot.id}` }] }, appointment.id),
    ).resolves.toMatchObject({ date: "2026-12-10", time: "08:30" });
  });

  it("refuses a start in the hour that repeats when clocks go back", async () => {
    // 1:30 AM happens twice in Chicago on November 1, 2026. 07:30 UTC is the second one.
    await expect(
      read({
        start: "2026-11-01T07:30:00Z",
        end: "2026-11-01T08:00:00Z",
        participant: [patient(), doctor()],
      }),
    ).rejects.toThrow("start can't fall in the hour that repeats when clocks go back");
  });

  it("refuses a body that isn't an Appointment", async () => {
    await expect(appointmentRequest(ctx, null, { timeZone: TZ })).rejects.toThrow(
      InvalidResourceError,
    );
    await expect(read({ resourceType: "Patient" })).rejects.toThrow(InvalidResourceError);
  });

  it("refuses an id that doesn't match the URL", async () => {
    const otherId = "00000000-0000-4000-8000-000000000000";
    await expect(
      read({ id: "something-else", slot: [{ reference: "Slot/x" }] }, otherId),
    ).rejects.toThrow("The resource's id must match the URL");
  });
});
