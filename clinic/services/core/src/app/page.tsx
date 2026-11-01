import Link from "next/link";
import { clinic } from "@/config";
import { fullName, getPatients } from "@/patients";
import { displayName, listPractitioners } from "@/practitioners";
import { listAppointments } from "@/schedule";
import { requestContext } from "@/session";
import { addDays, formatDate, formatTime, isIsoDate, todayIn } from "@/time";
import { first, type SearchParams } from "./search-params";

// The front desk's schedule for one day.
export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = todayIn(clinic.timeZone);
  const requested = first(params.date);
  const date = isIsoDate(requested) ? requested : today;

  const ctx = requestContext();
  const [appointments, practitioners] = await Promise.all([
    listAppointments(ctx, { date, timeZone: clinic.timeZone }),
    listPractitioners(ctx),
  ]);
  const patients = await getPatients(
    ctx,
    appointments.map((a) => a.patientId),
  );
  const practitionerNames = new Map(practitioners.map((p) => [p.id, displayName(p)]));

  return (
    <>
      <h1>{formatDate(date)}</h1>
      <div className="toolbar">
        <Link href={`/?date=${addDays(date, -1)}`}>Previous day</Link>
        {date !== today && <Link href="/">Today</Link>}
        <Link href={`/?date=${addDays(date, 1)}`}>Next day</Link>
        <span className="spacer" />
        <Link href="/patients" className="button">
          Book an appointment
        </Link>
      </div>

      {first(params.booked) && <p className="notice success">Appointment booked.</p>}

      {appointments.length === 0 ? (
        <p className="empty">No appointments on this day.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Patient</th>
              <th>MRN</th>
              <th>Practitioner</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => {
              const patient = patients.get(appointment.patientId);
              return (
                <tr key={appointment.id}>
                  <td>{formatTime(appointment.startsAt, clinic.timeZone)}</td>
                  <td>{patient ? fullName(patient) : "Unknown patient"}</td>
                  <td className="muted">{patient?.mrn}</td>
                  <td>{practitionerNames.get(appointment.practitionerId)}</td>
                  <td>{appointment.reason}</td>
                  <td>{appointment.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
