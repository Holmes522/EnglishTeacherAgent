import type { InputKind, LearningIntent } from "@english-teacher/contracts";

const MAX_ITEMS = 20;
const MAX_CODE_POINTS = 5_000;
const LIST_MARKER = /^(?:[-*•]\s+|\d{1,2}[.)、]\s*)/u;
const WRAPPING_QUOTES = /^(?:["“](.*)["”]|['‘](.*)['’])$/u;
const WORD_OR_PHRASE =
  /^[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*(?:\s+[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*){0,5}$/u;
const INSTRUCTION =
  /(请|只|不要|列出|给我|例句|评分|纠错|修改|词形|变形|释义|意思|\b(?:please|examples?|define|meaning|review|correct|forms?)\b)/iu;

export class IntakeLimitError extends Error {
  readonly code: "INPUT_TOO_LONG" | "TOO_MANY_ITEMS";

  constructor(code: "INPUT_TOO_LONG" | "TOO_MANY_ITEMS", message: string) {
    super(message);
    this.name = "IntakeLimitError";
    this.code = code;
  }
}

export class IntakeValidationError extends Error {
  readonly code = "EMPTY_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "IntakeValidationError";
  }
}

export interface IntakeItem {
  position: number;
  originalText: string;
  normalizedText: string;
  detectedKind: InputKind;
  detectedLanguage?: string;
}

export interface IntakeResult {
  intent: LearningIntent;
  items: IntakeItem[];
}

function stripPresentationSyntax(line: string): string {
  const withoutMarker = line.replace(LIST_MARKER, "").trim();
  const quoted = withoutMarker.match(WRAPPING_QUOTES);
  return (quoted?.[1] ?? quoted?.[2] ?? withoutMarker).trim();
}

function segmentLine(line: string): string[] {
  const sentenceEndings = line.match(/[.!?。！？](?=\s|$)/gu)?.length ?? 0;
  if (sentenceEndings < 2) {
    return [line];
  }

  return Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(line), ({ segment }) =>
    segment.trim(),
  ).filter(Boolean);
}

function classify(text: string): InputKind {
  if (!/[\p{L}\p{N}]/u.test(text)) {
    return "UNKNOWN";
  }
  if (INSTRUCTION.test(text)) {
    return "INSTRUCTION";
  }
  if (WORD_OR_PHRASE.test(text)) {
    const words = text.split(/\s+/u);
    if (words.length <= 3 && !/^(?:I|you|he|she|it|we|they)\b/iu.test(text)) {
      return "WORD";
    }
  }
  return "SENTENCE";
}

function detectLanguage(text: string): string | undefined {
  if (/\p{Script=Latin}/u.test(text)) {
    return "en";
  }
  if (/\p{Script=Han}/u.test(text)) {
    return "zh";
  }
  return undefined;
}

function inferIntent(items: IntakeItem[]): LearningIntent {
  const instructions = items
    .filter((item) => item.detectedKind === "INSTRUCTION")
    .map((item) => item.normalizedText)
    .join(" ");

  if (/(词形|变形|派生|\bforms?\b)/iu.test(instructions)) return "WORD_FORMS";
  if (/(例句|造句|\bexamples?\b)/iu.test(instructions)) return "EXAMPLES";
  if (/(评分|纠错|修改|\b(?:review|correct)\b)/iu.test(instructions)) return "REVIEW";
  if (/(释义|意思|查词|\b(?:define|meaning)\b)/iu.test(instructions)) return "LOOKUP";
  return "AUTO";
}

export function parseLearningInput(input: {
  rawText: string;
  intent: LearningIntent;
}): IntakeResult {
  if (Array.from(input.rawText).length > MAX_CODE_POINTS) {
    throw new IntakeLimitError("INPUT_TOO_LONG", "Input exceeds 5000 Unicode code points");
  }

  const originalItems = input.rawText
    .split(/\r?\n/u)
    .flatMap((line) => segmentLine(line.trim()))
    .map(stripPresentationSyntax)
    .filter(Boolean);

  if (originalItems.length === 0) {
    throw new IntakeValidationError("Input must contain at least one learning item");
  }

  if (originalItems.length > MAX_ITEMS) {
    throw new IntakeLimitError("TOO_MANY_ITEMS", "Input contains more than 20 items");
  }

  const items = originalItems.map((originalText, position) => {
    const normalizedText = originalText.normalize("NFKC").replace(/\s+/gu, " ").trim();
    return {
      position,
      originalText,
      normalizedText,
      detectedKind: classify(normalizedText),
      detectedLanguage: detectLanguage(normalizedText),
    } satisfies IntakeItem;
  });

  return {
    intent: input.intent === "AUTO" ? inferIntent(items) : input.intent,
    items,
  };
}
