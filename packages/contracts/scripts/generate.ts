import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createJsonSchemas, createOpenApiDocument } from "../src/generatedContracts.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = resolve(packageRoot, "generated");
const outputs = new Map([
  [resolve(generatedDirectory, "contracts.schema.json"), createJsonSchemas()],
  [resolve(generatedDirectory, "openapi.json"), createOpenApiDocument()],
]);

const checkOnly = process.argv.includes("--check");

await mkdir(generatedDirectory, { recursive: true });

for (const [path, value] of outputs) {
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  if (checkOnly) {
    const actual = await readFile(path, "utf8");
    if (actual !== expected) {
      throw new Error(`Generated contract is stale: ${path}`);
    }
  } else {
    await writeFile(path, expected, "utf8");
  }
}
