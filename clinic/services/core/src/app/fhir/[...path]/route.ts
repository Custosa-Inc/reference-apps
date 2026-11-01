import { fhirResponse, operationOutcome } from "@/fhir";

// Anything under /fhir that isn't supported yet gets a FHIR error instead of an HTML page.
function unsupported(request: Request) {
  const path = new URL(request.url).pathname;
  return fhirResponse(operationOutcome("not-supported", `${path} is not supported yet`), 404);
}

export { unsupported as GET, unsupported as POST, unsupported as PUT, unsupported as DELETE };
