import { clinic } from "@/config";
import {
  badRequest,
  baseUrlOf,
  countParam,
  fhirResponse,
  rejectUnsupported,
  searchBundle,
  toFhirSlot,
} from "@/fhir";
import { listSlots } from "@/schedule";
import { fhirContext } from "@/session";
import { isIsoDate } from "@/time";
import { z } from "zod";

const STATUSES = ["free", "busy", "busy-unavailable"];

// GET /fhir/Slot?start=2026-11-02&schedule=Schedule/{id}&status=free
// `start` is required: one day in the clinic's time zone. Without `schedule`, the slots of every
// practitioner are listed.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const refused = rejectUnsupported(params, "Slot");
  if (refused) return refused;

  const date = params.get("start")?.replace(/^eq/, "");
  if (!isIsoDate(date)) return badRequest("start is required: a day in the form YYYY-MM-DD");

  const schedule = params.get("schedule")?.replace(/^Schedule\//, "");
  if (schedule !== undefined && !z.uuid().safeParse(schedule).success) {
    return badRequest("schedule must be a Schedule ID or a reference like Schedule/{id}");
  }

  const status = params.get("status");
  if (status !== null && !STATUSES.includes(status)) {
    return badRequest(`status must be one of: ${STATUSES.join(", ")}`);
  }

  const limit = countParam(params);
  const slots = await listSlots(fhirContext(), {
    date,
    practitionerId: schedule,
    timeZone: clinic.timeZone,
  });
  const matches = slots.filter((slot) => status === null || slot.status === status);
  const page = matches.slice(0, limit).map(toFhirSlot);
  return fhirResponse(searchBundle(baseUrlOf(request), page, limit, matches.length));
}
