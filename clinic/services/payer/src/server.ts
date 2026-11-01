import { createServer } from "node:http";
import { EligibilityRequestError, respondToEligibility } from "./eligibility.ts";

// A mock insurance company. It answers X12 270 eligibility requests with 271 responses.

const port = Number(process.env.PORT ?? 8080);
const MAX_BODY_BYTES = 1_000_000;

const server = createServer(async (request, response) => {
  const send = (status: number, body: string, type = "text/plain; charset=utf-8") => {
    response.writeHead(status, { "content-type": type });
    response.end(body);
  };

  if (request.method === "GET" && request.url === "/health") return send(200, "ok\n");

  if (request.method === "GET" && request.url === "/") {
    return send(200, "Mock payer. POST an X12 270 eligibility request to /x12/270.\n");
  }

  if (request.method === "POST" && request.url === "/x12/270") {
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return send(413, "Request is too large\n");
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      return send(200, respondToEligibility(body), "application/edi-x12");
    } catch (error) {
      if (error instanceof EligibilityRequestError) return send(400, `${error.message}\n`);
      // A client that hung up mid-request has nobody left to answer.
      if (request.destroyed || response.headersSent) return;
      console.error(error);
      return send(500, "Something went wrong\n");
    }
  }

  send(404, "Not found\n");
});

server.listen(port, () => console.log(`Mock payer listening on port ${port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
