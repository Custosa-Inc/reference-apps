import { baseUrlOf, capabilityStatement, fhirResponse } from "@/fhir";

// What this FHIR server supports: https://hl7.org/fhir/R4/capabilitystatement.html
export function GET(request: Request) {
  return fhirResponse(capabilityStatement(baseUrlOf(request)));
}
