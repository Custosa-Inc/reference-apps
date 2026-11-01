import { and, asc, eq, gt, gte, inArray, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, type AuditEntry } from "@/audit";
import { inTransaction, type Context } from "@/context";
import { getPractitioner, listPractitioners } from "@/practitioners";
import { addDays, dayOfWeek, isIsoDate, zonedTimeToUtc } from "@/time";
import { appointmentStatusEnum, appointments } from "./tables";

export type Appointment = typeof appointments.$inferSelect;
export type AppointmentStatus = Appointment["status"];

/** Every FHIR appointment status. */
export const APPOINTMENT_STATUSES = appointmentStatusEnum.enumValues;

// The statuses that hold a practitioner's time. They match drizzle/0001_no_double_booking.sql.
const ACTIVE_STATUSES: AppointmentStatus[] = [
  "proposed",
  "pending",
  "booked",
  "arrived",
  "checked-in",
];

/** When the clinic sees patients: half-hour slots on weekdays, with a lunch break. */
export const SLOT_TIMES = `
  08:30 09:00 09:30 10:00 10:30 11:00 11:30 13:00 13:30 14:00 14:30 15:00 15:30 16:00 16:30
`
  .trim()
  .split(" ");
const SLOT_MINUTES = 30;

/** Every message a BookingError can carry. Screens show only these. */
export const BOOKING_MESSAGES = {
  patient: "Choose a patient.",
  practitioner: "Choose a practitioner.",
  date: "Enter a valid date.",
  time: "Enter a valid time.",
  tooShort: "Appointments are at least 5 minutes.",
  tooLong: "Appointments are at most 4 hours.",
  reason: "Keep the reason under 200 characters.",
  clash: "That practitioner already has an appointment at that time.",
  unknown: "That patient or practitioner doesn't exist.",
  otherPatient: "An appointment can't move to another patient.",
  closed: "This appointment can no longer be changed.",
  statusChange: "An appointment can only be cancelled or moved.",
  cancelOrMove: "Cancel an appointment or move it, not both.",
  noSlot: "That slot doesn't exist.",
  slotTaken: "That slot isn't free.",
} as const;

/** A booking the clinic can't accept. The message is one of BOOKING_MESSAGES. */
export class BookingError extends Error {
  name = "BookingError";
}

const bookingSchema = z.object({
  patientId: z.uuid(BOOKING_MESSAGES.patient),
  practitionerId: z.uuid(BOOKING_MESSAGES.practitioner),
  date: z.iso.date(BOOKING_MESSAGES.date),
  time: z.iso.time({ precision: -1, error: BOOKING_MESSAGES.time }),
  minutes: z.coerce
    .number(BOOKING_MESSAGES.tooShort)
    .int(BOOKING_MESSAGES.tooShort)
    .min(5, BOOKING_MESSAGES.tooShort)
    .max(240, BOOKING_MESSAGES.tooLong),
  reason: z
    .string(BOOKING_MESSAGES.reason)
    .trim()
    .max(200, BOOKING_MESSAGES.reason)
    .optional()
    .transform((value) => value || null),
});

type BookingRequest = z.input<typeof bookingSchema>;

/** An appointment as someone wants it to be: the booking fields plus a status. */
export type AppointmentChange = BookingRequest & { status: AppointmentStatus };

/** Checks a booking's fields and works out when it starts and ends. */
function parseBooking(request: BookingRequest, timeZone: string) {
  const parsed = bookingSchema.safeParse(request);
  if (!parsed.success) throw new BookingError(parsed.error.issues[0].message);
  const { date, time, minutes, ...rest } = parsed.data;
  const startsAt = zonedTimeToUtc(date, time, timeZone);
  return { ...rest, startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60_000) };
}

/** Runs a write, turning the database's refusals into BookingErrors. */
async function withBookingErrors<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    // Drizzle wraps the driver's error, which carries the Postgres error code. (Not instanceof:
    // Next.js can load two copies of drizzle-orm, and then the check fails.)
    const code = (error as { cause?: { code?: string } } | null)?.cause?.code;
    // 23P01: the practitioner already has an appointment then (drizzle/0001_no_double_booking.sql).
    if (code === "23P01") throw new BookingError(BOOKING_MESSAGES.clash);
    // 23503: a foreign key points at a patient or practitioner that doesn't exist.
    if (code === "23503") throw new BookingError(BOOKING_MESSAGES.unknown);
    throw error;
  }
}

function readEvent(appointment: Appointment): AuditEntry {
  return {
    action: "read",
    entityType: "Appointment",
    entityId: appointment.id,
    patientId: appointment.patientId,
  };
}

/**
 * Books an appointment at a wall-clock time in the clinic's time zone.
 * Throws BookingError if the request is invalid or the practitioner is already booked.
 */
export async function bookAppointment(
  ctx: Context,
  request: BookingRequest,
  timeZone: string,
): Promise<Appointment> {
  const booking = parseBooking(request, timeZone);
  return withBookingErrors(() =>
    inTransaction(ctx, async (tx) => {
      const [appointment] = await tx.db
        .insert(appointments)
        .values({ ...booking, status: "booked" })
        .returning();
      await recordAudit(tx, [
        {
          action: "create",
          entityType: "Appointment",
          entityId: appointment.id,
          patientId: appointment.patientId,
        },
      ]);
      return appointment;
    }),
  );
}

/**
 * Changes an appointment to match `change`. An active appointment can be cancelled, or moved to a
 * new time or practitioner under the same rules as booking. Returns null if there's no such
 * appointment.
 */
export async function updateAppointment(
  ctx: Context,
  id: string,
  change: AppointmentChange,
  timeZone: string,
): Promise<Appointment | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const wanted = parseBooking(change, timeZone);

  return withBookingErrors(() =>
    inTransaction(ctx, async (tx) => {
      const [current] = await tx.db
        .select()
        .from(appointments)
        .where(eq(appointments.id, id))
        .for("update");
      if (!current) return null;
      if (wanted.patientId !== current.patientId) {
        throw new BookingError(BOOKING_MESSAGES.otherPatient);
      }

      // A new time, practitioner or reason.
      const moved =
        wanted.practitionerId !== current.practitionerId ||
        wanted.startsAt.getTime() !== current.startsAt.getTime() ||
        wanted.endsAt.getTime() !== current.endsAt.getTime() ||
        wanted.reason !== current.reason;
      const statusChanged = change.status !== current.status;
      if (!moved && !statusChanged) {
        await recordAudit(tx, [readEvent(current)]);
        return current;
      }
      if (!ACTIVE_STATUSES.includes(current.status)) {
        throw new BookingError(BOOKING_MESSAGES.closed);
      }
      if (statusChanged && change.status !== "cancelled") {
        throw new BookingError(BOOKING_MESSAGES.statusChange);
      }
      if (statusChanged && moved) throw new BookingError(BOOKING_MESSAGES.cancelOrMove);

      const [updated] = await tx.db
        .update(appointments)
        .set(statusChanged ? { status: "cancelled" } : wanted)
        .where(eq(appointments.id, id))
        .returning();
      await recordAudit(tx, [
        { action: "update", entityType: "Appointment", entityId: id, patientId: current.patientId },
      ]);
      return updated;
    }),
  );
}

export async function getAppointment(ctx: Context, id: string): Promise<Appointment | null> {
  if (!z.uuid().safeParse(id).success) return null;
  return inTransaction(ctx, async (tx) => {
    const [appointment] = await tx.db.select().from(appointments).where(eq(appointments.id, id));
    if (!appointment) return null;
    await recordAudit(tx, [readEvent(appointment)]);
    return appointment;
  });
}

/** Lists appointments, earliest first. `date` is a day on the clinic's wall clock. */
export async function listAppointments(
  ctx: Context,
  query: { date?: string; patientId?: string; timeZone: string; limit?: number },
): Promise<Appointment[]> {
  const conditions: SQL[] = [];
  if (query.date) {
    const dayStart = zonedTimeToUtc(query.date, "00:00", query.timeZone);
    const nextDayStart = zonedTimeToUtc(addDays(query.date, 1), "00:00", query.timeZone);
    conditions.push(gte(appointments.startsAt, dayStart), lt(appointments.startsAt, nextDayStart));
  }
  if (query.patientId) conditions.push(eq(appointments.patientId, query.patientId));

  return inTransaction(ctx, async (tx) => {
    const rows = await tx.db
      .select()
      .from(appointments)
      .where(and(...conditions))
      .orderBy(asc(appointments.startsAt))
      .limit(query.limit ?? 200);
    await recordAudit(tx, rows.map(readEvent));
    return rows;
  });
}

/** A time a practitioner can be booked. Slots aren't stored; they follow from SLOT_TIMES. */
export type Slot = {
  id: string;
  practitionerId: string;
  startsAt: Date;
  endsAt: Date;
  /** FHIR's slot status: busy while an appointment holds any of it, busy-unavailable once it starts. */
  status: "free" | "busy" | "busy-unavailable";
};

/**
 * Lists a day's slots, earliest first, for one practitioner or all of them. A slot shows only that
 * a time is taken, not by whom, so listing slots isn't audited.
 */
export async function listSlots(
  ctx: Context,
  query: { date: string; practitionerId?: string; timeZone: string; now?: Date },
): Promise<Slot[]> {
  const { date, timeZone, now = new Date() } = query;
  if (dayOfWeek(date) === 0 || dayOfWeek(date) === 6) return [];
  const practitioners = query.practitionerId
    ? [await getPractitioner(ctx, query.practitionerId)].filter((p) => p !== null)
    : await listPractitioners(ctx);
  if (practitioners.length === 0) return [];

  const slots = SLOT_TIMES.flatMap((time) => {
    const startsAt = zonedTimeToUtc(date, time, timeZone);
    const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000);
    const stamp = `${date}${time}`.replace(/\D/g, "");
    return practitioners.map(({ id }) => ({
      id: `${id}-${stamp}`,
      practitionerId: id,
      startsAt,
      endsAt,
    }));
  });

  const taken = await ctx.db
    .select({
      practitionerId: appointments.practitionerId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .where(
      and(
        inArray(
          appointments.practitionerId,
          practitioners.map((p) => p.id),
        ),
        inArray(appointments.status, ACTIVE_STATUSES),
        lt(appointments.startsAt, slots[slots.length - 1].endsAt),
        gt(appointments.endsAt, slots[0].startsAt),
      ),
    );

  return slots.map((slot): Slot => {
    const busy = taken.some(
      (a) =>
        a.practitionerId === slot.practitionerId &&
        a.startsAt < slot.endsAt &&
        a.endsAt > slot.startsAt,
    );
    return { ...slot, status: busy ? "busy" : slot.startsAt <= now ? "busy-unavailable" : "free" };
  });
}

// A slot's ID is its practitioner's ID and its wall-clock start, such as {id}-202611020830.
const SLOT_ID = /^(.+)-(\d{4})(\d{2})(\d{2})\d{4}$/;

/** Finds a slot by its ID. Returns null if the ID isn't one of the clinic's slots. */
export async function getSlot(
  ctx: Context,
  id: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<Slot | null> {
  const match = SLOT_ID.exec(id);
  if (!match) return null;
  const [, practitionerId, year, month, day] = match;
  const date = `${year}-${month}-${day}`;
  if (!isIsoDate(date)) return null;
  const slots = await listSlots(ctx, { date, practitionerId, timeZone, now });
  return slots.find((slot) => slot.id === id) ?? null;
}

/** Finds a slot to book. Throws BookingError if it's taken or doesn't exist. */
export async function freeSlot(
  ctx: Context,
  id: string,
  timeZone: string,
  now: Date = new Date(),
): Promise<Slot> {
  const slot = await getSlot(ctx, id, timeZone, now);
  if (!slot) throw new BookingError(BOOKING_MESSAGES.noSlot);
  if (slot.status !== "free") throw new BookingError(BOOKING_MESSAGES.slotTaken);
  return slot;
}
