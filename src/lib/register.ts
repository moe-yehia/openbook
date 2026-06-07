/**
 * Communication Mode (BUILD_SPEC §7.9) — the 4 voice registers. This is the
 * canonical reference: the same data seeds `communication_registers` and drives
 * the style block that is threaded into EVERY AI feature's system prompt.
 * Pure data + helpers (no imports) so it's usable from server, client, and scripts.
 */

export type RegisterId = "formal" | "casual" | "gen_z" | "gen_alpha";

export type Register = {
  id: RegisterId;
  label: string;
  emoji: string;
  readingLevel: string;
  maxSentenceWords: number;
  blurb: string; // short description for the picker
  styleBlock: string; // the load-bearing system-prompt prefix
};

const ACCURACY =
  " Always stay factually accurate, precise, and clear — the register changes the VOICE, never the correctness. Never be condescending.";

export const REGISTERS: Register[] = [
  {
    id: "formal",
    label: "Formal",
    emoji: "🎓",
    readingLevel: "college",
    maxSentenceWords: 30,
    blurb: "Precise, professional, academic.",
    styleBlock:
      "Speak in a formal, professional, academic register: precise vocabulary, complete well-structured sentences, an objective and measured tone, no slang or emoji." +
      ACCURACY,
  },
  {
    id: "casual",
    label: "Casual",
    emoji: "💬",
    readingLevel: "general",
    maxSentenceWords: 24,
    blurb: "Friendly, plain, conversational.",
    styleBlock:
      "Speak in a warm, casual register: friendly and conversational, plain everyday language, contractions welcome, like a smart friend explaining something over coffee." +
      ACCURACY,
  },
  {
    id: "gen_z",
    label: "Gen Z",
    emoji: "😎",
    readingLevel: "teen",
    maxSentenceWords: 18,
    blurb: "Relaxed, current, a little slang.",
    styleBlock:
      "Speak in a Gen Z register: relaxed and current, light natural slang where it fits (e.g. \"lowkey\", \"fr\", \"it's giving\", \"no cap\"), short punchy sentences, the occasional emoji. Keep it real." +
      ACCURACY,
  },
  {
    id: "gen_alpha",
    label: "Gen Alpha",
    emoji: "🧢",
    readingLevel: "middle",
    maxSentenceWords: 16,
    blurb: "High-energy, playful, meme-aware.",
    styleBlock:
      "Speak in a playful Gen Alpha register: high-energy, very current and meme-aware but school-appropriate, short snappy lines, fun analogies, the occasional emoji. Make it genuinely fun to learn from." +
      ACCURACY,
  },
];

export const DEFAULT_REGISTER: RegisterId = "casual";

export function getRegister(id?: string | null): Register {
  return (
    REGISTERS.find((r) => r.id === id) ??
    REGISTERS.find((r) => r.id === DEFAULT_REGISTER)!
  );
}

/** The style block to prepend to any AI system prompt for this user's voice. */
export function getRegisterStyle(id?: string | null): string {
  return getRegister(id).styleBlock;
}
