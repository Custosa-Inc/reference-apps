import { findSegment, parseX12, writeX12 } from "./x12.ts";

const PAYER_ID = "MOCKPLAN";
const PAYER_NAME = "MOCK HEALTH PLAN";
const VERSION = "005010X279A1";

/** A request the payer can't read. The message is safe to send back. */
export class EligibilityRequestError extends Error {
  name = "EligibilityRequestError";
}

/**
 * Answers an X12 270 eligibility request with a 271 response.
 *
 * For now every member with an ID has active coverage. A request without a member ID gets an
 * AAA rejection with reason 72 (invalid or missing member ID).
 */
export function respondToEligibility(requestText: string, now: Date = new Date()): string {
  let request;
  try {
    request = parseX12(requestText);
  } catch (error) {
    throw new EligibilityRequestError((error as Error).message);
  }

  const isa = findSegment(request, "ISA")!;
  const st = findSegment(request, "ST");
  if (st?.[1] !== "270") {
    throw new EligibilityRequestError("Expected a 270 eligibility request (ST*270)");
  }

  const clinicId = isa[6]?.trim() || "CLINIC";
  const controlNumber = Number(isa[13]) || 1;
  const bht = findSegment(request, "BHT");
  const provider = findSegment(request, "NM1", (s) => s[1] === "1P");
  const trace = findSegment(request, "TRN", (s) => s[1] === "1");
  const subscriber = findSegment(request, "NM1", (s) => s[1] === "IL");
  if (!subscriber) throw new EligibilityRequestError("Expected a subscriber (NM1*IL)");
  const birthDate = findSegment(request, "DMG");
  const memberId = subscriber[8] === "MI" ? subscriber[9] : undefined;

  const iso = now.toISOString();
  const date = iso.slice(0, 10).replaceAll("-", ""); // CCYYMMDD
  const time = iso.slice(11, 16).replace(":", ""); // HHMM

  const body: string[][] = [
    ["ST", "271", "0001", VERSION],
    ["BHT", "0022", "11", bht?.[3] ?? "", date, time],
    ["HL", "1", "", "20", "1"],
    ["NM1", "PR", "2", PAYER_NAME, "", "", "", "", "PI", PAYER_ID],
    ["HL", "2", "1", "21", "1"],
    provider ?? ["NM1", "1P", "2", clinicId],
    ["HL", "3", "2", "22", "0"],
  ];
  // The 271 echoes the request's trace number so the clinic can match the answer to its question.
  if (trace) body.push(["TRN", "2", trace[2], trace[3]]);
  // The subscriber loop (2100C) puts a rejection before the birth date. Benefits (2110C) follow it.
  body.push(subscriber);
  if (!memberId) body.push(["AAA", "N", "", "72", "C"]);
  if (birthDate) body.push(birthDate);
  if (memberId) body.push(["EB", "1", "IND", "30", "", "MOCK PPO"]);
  body.push(["SE", String(body.length + 1), "0001"]);

  return writeX12(
    {
      sender: PAYER_ID,
      receiver: clinicId,
      controlNumber,
      functionalId: "HB",
      version: VERSION,
      date,
      time,
    },
    body,
  );
}
