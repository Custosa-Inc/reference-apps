import { beforeAll, describe, expect, it } from "vitest";
import { listAuditEvents } from "@/audit";
import type { Context } from "@/context";
import { createPatient, type Patient } from "@/patients";
import { createPractitioner, type Practitioner } from "@/practitioners";
import {
  BookingError,
  bookAppointment,
  getAppointment,
  getSlot,
  listAppointments,
  listSlots,
  freeSlot,
  SLOT_TIMES,
  updateAppointment,
  type Appointment,
  type AppointmentChange,
  type AppointmentStatus,
} from "@/schedule";
import { appointments } from "@/schedule/tables";
import { wallClockIn } from "@/time";
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

describe("listSlots", () => {
  const before = new Date("2026-12-01T00:00:00Z"); // earlier than every slot below

  function slotsOn(date: string, now = before) {
    return listSlots(ctx, { date, practitionerId: practitioner.id, timeZone: TZ, now });
  }

  it("offers the clinic's half-hour slots on a weekday", async () => {
    const slots = await slotsOn("2026-12-07");
    expect(slots).toHaveLength(SLOT_TIMES.length);
    expect(slots[0]).toMatchObject({
      practitionerId: practitioner.id,
      status: "free",
      startsAt: new Date("2026-12-07T14:30:00Z"), // 8:30 AM in Chicago
      endsAt: new Date("2026-12-07T15:00:00Z"),
    });
  });

  it("marks every slot an appointment overlaps as busy", async () => {
    await book("2026-12-08", "09:15");
    const busy = (await slotsOn("2026-12-08")).filter((slot) => slot.status === "busy");
    expect(busy.map((slot) => slot.startsAt.toISOString())).toEqual([
      "2026-12-08T15:00:00.000Z",
      "2026-12-08T15:30:00.000Z",
    ]);
  });

  it("marks slots that have started as unavailable", async () => {
    const noon = new Date("2026-12-10T18:00:00Z");
    const slots = await slotsOn("2026-12-10", noon);
    expect(slots[0].status).toBe("busy-unavailable");
    expect(slots.find((slot) => slot.status === "free")?.startsAt).toEqual(
      new Date("2026-12-10T19:00:00Z"), // 1:00 PM, after lunch
    );
  });

  it("has no slots on weekends", async () => {
    expect(await slotsOn("2026-12-12")).toEqual([]);
  });

  it("finds a slot by its ID", async () => {
    const [first] = await slotsOn("2026-12-14");
    expect(await getSlot(ctx, first.id, TZ, before)).toEqual(first);
    expect(await getSlot(ctx, first.id.replace(/0830$/, "0845"), TZ, before)).toBeNull();
    expect(await getSlot(ctx, "not-a-slot", TZ, before)).toBeNull();
  });

  it("finds a free slot to book", async () => {
    const [first] = await slotsOn("2026-12-17");
    expect(await freeSlot(ctx, first.id, TZ, before)).toEqual(first);
  });

  it("refuses a slot that's taken or doesn't exist", async () => {
    await book("2026-12-17", "09:00");
    const taken = (await slotsOn("2026-12-17")).find((slot) => slot.status === "busy")!;
    await expect(freeSlot(ctx, taken.id, TZ, before)).rejects.toThrow("That slot isn't free.");
    await expect(freeSlot(ctx, "not-a-slot", TZ, before)).rejects.toThrow(
      "That slot doesn't exist.",
    );
  });
});

describe("updateAppointment", () => {
  /** The change that leaves an appointment as it is, with some fields replaced. */
  function change(appointment: Appointment, edits: Partial<AppointmentChange> = {}) {
    const { date, time } = wallClockIn(appointment.startsAt, TZ);
    const unchanged: AppointmentChange = {
      patientId: appointment.patientId,
      practitionerId: appointment.practitionerId,
      date,
      time,
      minutes: 30,
      reason: appointment.reason ?? undefined,
      status: appointment.status,
    };
    return { ...unchanged, ...edits };
  }

  it("moves an appointment and records the change", async () => {
    const appointment = await book("2026-12-15", "09:00");
    const moved = await updateAppointment(
      ctx,
      appointment.id,
      change(appointment, { time: "10:00" }),
      TZ,
    );

    expect(moved?.startsAt).toEqual(new Date("2026-12-15T16:00:00Z"));
    const [event] = await listAuditEvents(ctx, { patientId: patient.id, limit: 1 });
    expect(event).toMatchObject({ action: "update", entityId: appointment.id });
  });

  it("refuses to move an appointment onto another one", async () => {
    await book("2026-12-15", "11:00");
    const later = await book("2026-12-15", "13:00");
    await expect(
      updateAppointment(ctx, later.id, change(later, { time: "11:00" }), TZ),
    ).rejects.toThrow("That practitioner already has an appointment at that time.");
  });

  it("cancels an appointment and frees its slot", async () => {
    const appointment = await book("2026-12-16", "09:00");
    const cancelled = await updateAppointment(
      ctx,
      appointment.id,
      change(appointment, { status: "cancelled" }),
      TZ,
    );

    expect(cancelled?.status).toBe("cancelled");
    const slots = await listSlots(ctx, {
      date: "2026-12-16",
      practitionerId: practitioner.id,
      timeZone: TZ,
      now: new Date("2026-12-01T00:00:00Z"),
    });
    expect(slots.every((slot) => slot.status === "free")).toBe(true);
  });

  it("refuses to cancel and move at once", async () => {
    const appointment = await book("2026-12-16", "10:00");
    await expect(
      updateAppointment(
        ctx,
        appointment.id,
        change(appointment, { status: "cancelled", time: "10:30" }),
        TZ,
      ),
    ).rejects.toThrow("Cancel an appointment or move it, not both.");
  });

  it("won't change an appointment once it's cancelled", async () => {
    const appointment = await book("2026-12-16", "11:00");
    const cancelled = await updateAppointment(
      ctx,
      appointment.id,
      change(appointment, { status: "cancelled" }),
      TZ,
    );
    await expect(
      updateAppointment(ctx, appointment.id, change(cancelled!, { status: "booked" }), TZ),
    ).rejects.toThrow("This appointment can no longer be changed.");
  });

  it("won't change an appointment's status except to cancel it", async () => {
    const appointment = await book("2026-12-16", "13:00");
    await expect(
      updateAppointment(ctx, appointment.id, change(appointment, { status: "fulfilled" }), TZ),
    ).rejects.toThrow("An appointment can only be cancelled or moved.");
  });

  it("won't move an appointment to another patient", async () => {
    const appointment = await book("2026-12-16", "14:00");
    const other = await createPatient(ctx, {
      givenName: "John",
      familyName: "Roe",
      birthDate: "1975-05-05",
      gender: "male",
    });
    await expect(
      updateAppointment(ctx, appointment.id, change(appointment, { patientId: other.id }), TZ),
    ).rejects.toThrow("An appointment can't move to another patient.");
  });

  it("leaves an unchanged appointment as it is", async () => {
    const appointment = await book("2026-12-16", "15:00");
    const same = await updateAppointment(ctx, appointment.id, change(appointment), TZ);
    expect(same).toEqual(appointment);
  });

  it("returns null for an appointment that doesn't exist", async () => {
    const appointment = await book("2026-12-16", "16:00");
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await updateAppointment(ctx, missing, change(appointment), TZ)).toBeNull();
  });
});
