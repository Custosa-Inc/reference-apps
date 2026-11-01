import { and, asc, eq, gte, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { recordAudit, type AuditEntry } from "@/audit";
import { inTransaction, type Context } from "@/context";
import { addDays, zonedTimeToUtc } from "@/time";
import { appointments } from "./tables";

export type Appointment = typeof appointments.$inferSelect;
export type AppointmentStatus = Appointment["status"];

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
  const parsed = bookingSchema.safeParse(request);
  if (!parsed.success) throw new BookingError(parsed.error.issues[0].message);
  const { patientId, practitionerId, date, time, minutes, reason } = parsed.data;

  const startsAt = zonedTimeToUtc(date, time, timeZone);
  const endsAt = new Date(startsAt.getTime() + minutes * 60_000);

  try {
    return await inTransaction(ctx, async (tx) => {
      const [appointment] = await tx.db
        .insert(appointments)
        .values({ patientId, practitionerId, status: "booked", startsAt, endsAt, reason })
        .returning();
      await recordAudit(tx, [
        { action: "create", entityType: "Appointment", entityId: appointment.id, patientId },
      ]);
      return appointment;
    });
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
