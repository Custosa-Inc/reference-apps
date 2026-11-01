import Link from "next/link";
import { fullName, searchPatients } from "@/patients";
import { requestContext } from "@/session";
import { first, type SearchParams } from "../search-params";

// Patient search. Nothing is listed until the user searches, the way front-desk systems work.
export default async function PatientsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = (first((await searchParams).q) ?? "").trim();
  const patients = query ? await searchPatients(requestContext(), { name: query }) : [];

  return (
    <>
      <h1>Patients</h1>
      <form className="toolbar" action="/patients">
        <input name="q" defaultValue={query} placeholder="Search by name" autoFocus />
        <button type="submit">Search</button>
      </form>

      {!query ? (
        <p className="empty">Search for a patient by first or last name.</p>
      ) : patients.length === 0 ? (
        <p className="empty">No patients match &ldquo;{query}&rdquo;.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>MRN</th>
              <th>Date of birth</th>
              <th>Phone</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.id}>
                <td>{fullName(patient)}</td>
                <td className="muted">{patient.mrn}</td>
                <td>{patient.birthDate}</td>
                <td>{patient.phone}</td>
                <td>
                  <Link href={`/appointments/new?patient=${patient.id}`}>Book appointment</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
