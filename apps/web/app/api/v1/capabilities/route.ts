import { capabilityManifestSchema } from "@english-teacher/contracts";
import { DisabledSpeechProvider } from "@english-teacher/speech";

const speechProvider = new DisabledSpeechProvider();

const manifest = capabilityManifestSchema.parse({
  schemaVersion: 1,
  speech: speechProvider.getCapability(),
  targetLanguages: ["en"],
  uiLocales: ["zh-CN"],
  extensionSlots: ["header", "composer.before", "result.card.after", "sidebar"],
});

export const dynamic = "force-static";

// Route Handlers use the Web Response API in Next.js 16.
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/route
export function GET(): Response {
  return Response.json(manifest);
}
