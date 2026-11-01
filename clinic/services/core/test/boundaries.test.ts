import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

// Checks the module rules in clinic/ARCHITECTURE.md:
// - a module's tables.ts is used only by that module and by other tables.ts for foreign keys
// - modules call each other only through index.ts
// - only session/, db/ and instrumentation.ts open the database (importing its types is fine)

const SRC = fileURLToPath(new URL("../src", import.meta.url));
// Every folder in src/ is a module, except the Next.js app and the database setup.
const MODULES = readdirSync(SRC, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "app" && entry.name !== "db")
  .map((entry) => entry.name);
const MAY_OPEN_DB = ["db", "session", "instrumentation.ts"];

function importsOf(file: string) {
  const code = readFileSync(path.join(SRC, file), "utf8");
  const pattern =
    /(import\s+type\s[^"']*?from\s+|from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
  return [...code.matchAll(pattern)].map((match) => ({
    specifier: match[2],
    typeOnly: match[1].startsWith("import type"),
  }));
}

/** The path under src/ that an import points at, or null for packages. */
function target(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith(".")) return path.posix.join(path.posix.dirname(from), specifier);
  return null;
}

it("keeps modules behind their index.ts and the database behind session/ and db/", () => {
  const problems: string[] = [];
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => file.split(path.sep).join("/"));

  for (const from of files) {
    const fromTop = from.split("/")[0];

    for (const { specifier, typeOnly } of importsOf(from)) {
      const to = target(from, specifier);
      if (!to) continue;
      const [toTop, ...rest] = to.split("/");
      const inner = rest.join("/").replace(/\.tsx?$/, "");

      if (MODULES.includes(toTop) && toTop !== fromTop) {
        const viaIndex = inner === "" || inner === "index";
        // tables.ts files may point at each other for foreign keys.
        const tablesAllowed = inner === "tables" && from.endsWith("/tables.ts");
        if (!viaIndex && !tablesAllowed) problems.push(`${from} imports ${specifier}`);
      }

      if (toTop === "db" && !typeOnly && fromTop !== "db" && !MAY_OPEN_DB.includes(fromTop)) {
        problems.push(`${from} imports ${specifier}; use ctx.db instead`);
      }
    }
  }

  expect(problems).toEqual([]);
});
