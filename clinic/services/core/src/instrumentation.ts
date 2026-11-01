// Next.js runs register() once per server process, before it handles requests.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { prepareDatabase } = await import("./db/prepare");
  await prepareDatabase();
}
