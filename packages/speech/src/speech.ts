export interface SpeechSynthesisInput {
  text: string;
  language: string;
  variant?: "UK" | "US";
  voiceId: string;
  speed: number;
  format: "mp3" | "opus";
}

export interface SpeechSynthesisOutput {
  audio: Uint8Array;
  durationMs: number;
  providerVersion: string;
}

export interface SpeechProvider {
  getCapability(): { status: "NOT_ENABLED" | "AVAILABLE" };
  synthesize(input: SpeechSynthesisInput): Promise<SpeechSynthesisOutput>;
}

export class SpeechNotEnabledError extends Error {
  readonly code = "SPEECH_NOT_ENABLED";

  constructor() {
    super("Speech synthesis is not enabled for this deployment");
    this.name = "SpeechNotEnabledError";
  }
}

export class DisabledSpeechProvider implements SpeechProvider {
  getCapability(): { status: "NOT_ENABLED" } {
    return { status: "NOT_ENABLED" };
  }

  synthesize(input: SpeechSynthesisInput): Promise<never> {
    void input;
    return Promise.reject(new SpeechNotEnabledError());
  }
}
