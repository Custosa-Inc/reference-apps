import { beforeAll, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/audit";
import type { Context } from "@/context";
import { createPatient, type Patient } from "@/patients";
import { createPractitioner, type Practitioner } from "@/practitioners";
import {
  BookingError,
  bookAppointment,
  getAppointment,
  listAppointments,
  type AppointmentStatus,
} from "@/schedule";
import { appointments } from "@/schedule/tables";
import { createTestContext } from "./db";

const TZ = "America/Chicago";

let ctx: Context;
let patient: Patient;
let practitioner: Practitioner;

beforeAll(async () => {
  ctx = await createTestContext();
  patient = await createPatient(ctx, {
    givenName: "Jane",
    familyName: "Doe",
    birthDate: "1980-01-01",
    gender: "female",
  });
  practitioner = await createPractitioner(ctx, {
    givenName: "Amara",
    familyName: "Okafor",
    suffix: "MD",
    specialty: "Family medicine",
  });
});

function book(date: string, time: string, minutes = 30) {
  return bookAppointment(
    ctx,
    {
      patientId: patient.id,
      practitionerId: practitioner.id,
      date,
      time,
      minutes,
      reason: "Checkup",
    },
    TZ,
  );
}

describe("bookAppointment", () => {
  it("books at the clinic's wall-clock time and records who did it", async () => {
    const appointment = await book("2026-11-02", "09:00");

    expect(appointment.status).toBe("booked");
    // 9:00 AM in Chicago on November 2, 2026 is 15:00 UTC (Central Standard Time).
    expect(appointment.startsAt.toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(appointment.endsAt.toISOString()).toBe("2026-11-02T15:30:00.000Z");

    const [event] = await listAuditEvents(ctx, { patientId: patient.id, limit: 1 });
    expect(event).toMatchObject({
      action: "create",
      entityType: "Appointment",
      entityId: appointment.id,
      actorId: "test-user",
      source: "test",
    });
  });

  it("refuses an overlapping booking for the same practitioner", async () => {
    await book("2026-11-03", "10:00");
    await expect(book("2026-11-03", "10:15")).rejects.toThrow(BookingError);
  });

  it("allows back-to-back bookings", async () => {
    await book("2026-11-04", "10:00");
    await expect(book("2026-11-04", "10:30")).resolves.toMatchObject({ status: "booked" });
  });

  it("rejects bad input with a message for the screen", async () => {
    await expect(book("2026-02-30", "09:00")).rejects.toThrow("Enter a valid date.");
    await expect(book("2026-11-05", "25:00")).rejects.toThrow("Enter a valid time.");
  });

  it("rejects an unknown patient", async () => {
    await expect(
      bookAppointment(
        ctx,
        {
          patientId: "00000000-0000-4000-8000-000000000000",
          practitionerId: practitioner.id,
          date: "2026-11-06",
          time: "09:00",
          minutes: 30,
        },
        TZ,
      ),
    ).rejects.toThrow("That patient or practitioner doesn't exist.");
  });
});

describe("the database", () => {
  // Saves a row directly, skipping bookAppointment's own check, the way a racing booking would.
  function insert(starts: string, ends: string, status: AppointmentStatus = "booked") {
    return ctx.db.insert(appointments).values({
      patientId: patient.id,
      practitionerId: practitioner.id,
      status,
      startsAt: new Date(starts),
      endsAt: new Date(ends),
    });
  }

  it("refuses an overlapping appointment even without the app's check", async () => {
    await insert("2026-11-16T15:00:00Z", "2026-11-16T15:30:00Z");
    await expect(insert("2026-11-16T15:15:00Z", "2026-11-16T15:45:00Z")).rejects.toMatchObject({
      cause: { code: "23P01" },
    });
  });

  it("refuses a status that isn't a FHIR appointment status", async () => {
    const madeUp = "done" as AppointmentStatus;
    await expect(
      insert("2026-11-18T15:00:00Z", "2026-11-18T15:30:00Z", madeUp),
    ).rejects.toMatchObject({ cause: { code: "22P02" } });
  });

  it("lets a cancelled appointment's time be booked again", async () => {
    await insert("2026-11-17T15:00:00Z", "2026-11-17T15:30:00Z", "cancelled");
    await expect(insert("2026-11-17T15:00:00Z", "2026-11-17T15:30:00Z")).resolves.toBeDefined();
  });
});

describe("listAppointments", () => {
  it("returns one clinic day, including evenings that fall on the next UTC day", async () => {
    const late = await book("2026-11-09", "18:30"); // 00:30 UTC on November 10
    await book("2026-11-10", "08:30");

    const day = await listAppointments(ctx, { date: "2026-11-09", timeZone: TZ });
    expect(day.map((a) => a.id)).toEqual([late.id]);
  });

  it("records a read for each appointment returned", async () => {
    const appointment = await book("2026-11-11", "09:00");
    await getAppointment(ctx, appointment.id);

    const [event] = await listAuditEvents(ctx, { patientId: patient.id, limit: 1 });
    expect(event).toMatchObject({ action: "read", entityId: appointment.id });
  });
});
