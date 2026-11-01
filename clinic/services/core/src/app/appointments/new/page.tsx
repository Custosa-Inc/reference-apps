import Link from "next/link";
import { redirect } from "next/navigation";
import { clinic } from "@/config";
import { fullName, getPatient } from "@/patients";
import { displayName, listPractitioners } from "@/practitioners";
import { BOOKING_MESSAGES } from "@/schedule";
import { requestContext } from "@/session";
import { isIsoDate, todayIn } from "@/time";
import { first, type SearchParams } from "../../search-params";
import { bookAction } from "./actions";

export default async function NewAppointmentPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const patientId = first(params.patient);
  if (!patientId) redirect("/patients");
  const date = first(params.date);
  // Show only messages the app wrote, never text someone put in the link.
  const error = Object.values(BOOKING_MESSAGES).find((message) => message === first(params.error));

  const ctx = requestContext();
  const [patient, practitioners] = await Promise.all([
    getPatient(ctx, patientId),
    listPractitioners(ctx),
  ]);
  if (!patient) redirect("/patients");

  return (
    <>
      <h1>Book an appointment</h1>
      <p>
        For <strong>{fullName(patient)}</strong>{" "}
        <span className="muted">
          (MRN {patient.mrn}, born {patient.birthDate})
        </span>{" "}
        <Link href="/patients">Change patient</Link>
      </p>

      {error && <p className="notice error">{error}</p>}

      <form className="stack" action={bookAction}>
        <input type="hidden" name="patientId" value={patient.id} />
        <label>
          Practitioner
          <select name="practitionerId" defaultValue={first(params.practitioner)} required>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}, {p.specialty}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            name="date"
            defaultValue={isIsoDate(date) ? date : todayIn(clinic.timeZone)}
            required
          />
        </label>
        <label>
          Time
          <input
            type="time"
            name="time"
            step={300}
            defaultValue={first(params.time) ?? "09:00"}
            required
          />
        </label>
        <label>
          Length
          <select name="minutes" defaultValue="30">
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </label>
        <label>
          Reason
          <input name="reason" maxLength={200} placeholder="For example, annual physical" />
        </label>
        <button type="submit">Book</button>
      </form>
    </>
  );
}
