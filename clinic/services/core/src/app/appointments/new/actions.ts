"use server";

import { redirect } from "next/navigation";
import { clinic } from "@/config";
import { BookingError, bookAppointment } from "@/schedule";
import { requestContext } from "@/session";

export async function bookAction(form: FormData) {
  const field = (name: string) => String(form.get(name) ?? "");
  const request = {
    patientId: field("patientId"),
    practitionerId: field("practitionerId"),
    date: field("date"),
    time: field("time"),
    minutes: field("minutes"),
    reason: field("reason"),
  };

  try {
    await bookAppointment(requestContext(), request, clinic.timeZone);
  } catch (error) {
    if (!(error instanceof BookingError)) throw error;
    // Send the user back to the form with what they chose and why it didn't work.
    const back = new URLSearchParams({
      patient: request.patientId,
      practitioner: request.practitionerId,
      date: request.date,
      time: request.time,
      error: error.message,
    });
    redirect(`/appointments/new?${back}`);
  }

  redirect(`/?date=${request.date}&booked=1`);
}
