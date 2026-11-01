import { describe, expect, it } from "vitest";
import { EligibilityRequestError, respondToEligibility } from "../src/eligibility.ts";
import { findSegment, parseX12 } from "../src/x12.ts";

const request = [
  "ISA*00*          *00*          *ZZ*CLINIC         *ZZ*MOCKPLAN       *261101*0900*^*00501*000000101*0*T*:~",
  "GS*HS*CLINIC*MOCKPLAN*20261101*0900*101*X*005010X279A1~",
  "ST*270*0001*005010X279A1~",
  "BHT*0022*13*REQ0001*20261101*0900~",
  "HL*1**20*1~",
  "NM1*PR*2*MOCK HEALTH PLAN*****PI*MOCKPLAN~",
  "HL*2*1*21*1~",
  "NM1*1P*2*SPRINGFIELD FAMILY CLINIC*****XX*0000000000~",
  "HL*3*2*22*0~",
  "TRN*1*TRACE0001*9CLINIC~",
  "NM1*IL*1*DOE*JANE****MI*MEMBER123~",
  "DMG*D8*19800101~",
  "DTP*291*D8*20261101~",
  "EQ*30~",
  "SE*13*0001~",
  "GE*1*101~",
  "IEA*1*000000101~",
].join("\n");

const now = new Date("2026-11-01T15:00:00Z");

describe("respondToEligibility", () => {
  it("answers a 270 with a 271 showing active coverage", () => {
    const response = parseX12(respondToEligibility(request, now));

    expect(findSegment(response, "ST")).toEqual(["ST", "271", "0001", "005010X279A1"]);
    expect(findSegment(response, "EB")?.slice(0, 4)).toEqual(["EB", "1", "IND", "30"]);
    expect(findSegment(response, "TRN")).toEqual(["TRN", "2", "TRACE0001", "9CLINIC"]);
    expect(findSegment(response, "NM1", (s) => s[1] === "IL")?.[9]).toBe("MEMBER123");
    expect(response.at(-1)?.[0]).toBe("IEA");
  });

  it("writes a fixed-width ISA and a correct segment count", () => {
    const text = respondToEligibility(request, now);
    expect(text.indexOf("~")).toBe(105);

    const segments = parseX12(text);
    const st = segments.findIndex((s) => s[0] === "ST");
    const se = segments.findIndex((s) => s[0] === "SE");
    expect(Number(segments[se][1])).toBe(se - st + 1);
  });

  it("rejects a request without a member ID", () => {
    const withoutMember = request.replace("****MI*MEMBER123", "");
    const segments = parseX12(respondToEligibility(withoutMember, now));
    expect(findSegment(segments, "AAA")).toEqual(["AAA", "N", "", "72", "C"]);
    expect(findSegment(segments, "EB")).toBeUndefined();

    // The 271 guide orders the subscriber loop NM1, AAA, DMG.
    const ids = segments.map((s) => s[0]);
    const subscriber = segments.findIndex((s) => s[0] === "NM1" && s[1] === "IL");
    expect(ids.slice(subscriber, subscriber + 3)).toEqual(["NM1", "AAA", "DMG"]);
  });

  it("puts benefits after the subscriber's details", () => {
    const ids = parseX12(respondToEligibility(request, now)).map((s) => s[0]);
    expect(ids.indexOf("EB")).toBeGreaterThan(ids.indexOf("DMG"));
  });

  it("refuses a request without a subscriber", () => {
    const withoutSubscriber = request.replace("NM1*IL*1*DOE*JANE****MI*MEMBER123~\n", "");
    expect(() => respondToEligibility(withoutSubscriber, now)).toThrow("Expected a subscriber");
  });

  it("refuses anything that isn't a 270", () => {
    expect(() => respondToEligibility("hello")).toThrow(EligibilityRequestError);
    expect(() => respondToEligibility(request.replace("ST*270", "ST*837"))).toThrow(
      "Expected a 270 eligibility request",
    );
  });
});
