-- A practitioner can't have two appointments at once, even when two bookings race. Cancelled and
-- missed appointments free their slot. bookAppointment turns a violation (23P01) into a message.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_double_booking" EXCLUDE USING gist (
  "practitioner_id" WITH =,
  tstzrange("starts_at", "ends_at") WITH &&
) WHERE ("status" IN ('proposed', 'pending', 'booked', 'arrived', 'checked-in'));
