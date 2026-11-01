import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite loads a WebAssembly build of Postgres, so it must stay out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Stop `next dev` from writing an AGENTS.md file.
  agentRules: false,
};

export default nextConfig;
