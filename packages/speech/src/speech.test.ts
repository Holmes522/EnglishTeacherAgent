import { describe, expect, it } from "vitest";

import { DisabledSpeechProvider, SpeechNotEnabledError } from "./speech.js";

describe("DisabledSpeechProvider", () => {
  it("reports speech as explicitly unavailable", () => {
    const provider = new DisabledSpeechProvider();
    expect(provider.getCapability()).toEqual({ status: "NOT_ENABLED" });
  });

  it("fails without making a synthetic audio claim", async () => {
    const provider = new DisabledSpeechProvider();
    const request = provider.synthesize({
      text: "apple",
      language: "en",
      variant: "US",
      voiceId: "disabled",
      speed: 1,
      format: "mp3",
    });

    await expect(request).rejects.toBeInstanceOf(SpeechNotEnabledError);
    await expect(request).rejects.toMatchObject({ code: "SPEECH_NOT_ENABLED" });
  });
});
