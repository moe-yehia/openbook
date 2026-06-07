import { toFile } from "@anthropic-ai/sdk";
import { anthropic, model } from "@/lib/anthropic";

/** Tolerant JSON extraction from a model reply (strips fences, finds the object). */
export function extractJson<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    const start = raw.indexOf("{");
    const arrStart = raw.indexOf("[");
    const s = start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);
    const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    if (s !== -1 && end > s) {
      try {
        return JSON.parse(raw.slice(s, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function textOf(msg: { content: Array<{ type: string; text?: string }> }): string {
  return msg.content.find((b) => b.type === "text")?.text ?? "";
}

/** 4 short starter questions for the tutor empty state. */
export async function generateStarterQuestions(sample: string): Promise<string[]> {
  const r = await anthropic.messages.create({
    model: model("fast"),
    max_tokens: 400,
    system:
      'Output ONLY minified JSON: {"questions": string[]}. 4 short, specific questions a student could ask to start learning this material. No prose, no code fences.',
    messages: [{ role: "user", content: `Material:\n"""${sample.slice(0, 6000)}"""` }],
  });
  const parsed = extractJson<{ questions: string[] }>(textOf(r));
  return (parsed?.questions ?? []).slice(0, 4).filter((q) => typeof q === "string");
}

/** 5–10 concept nodes that actually appear in the material (per-doc concept graph). */
export async function seedConcepts(
  sample: string
): Promise<{ label: string; summary: string }[]> {
  const r = await anthropic.messages.create({
    model: model("fast"),
    max_tokens: 900,
    system:
      'Output ONLY minified JSON: {"concepts":[{"label":string,"summary":string}]}. 5-10 key concepts that actually appear in the material, each summary <= 18 words. No prose, no code fences.',
    messages: [{ role: "user", content: `Material:\n"""${sample.slice(0, 9000)}"""` }],
  });
  const parsed = extractJson<{ concepts: { label: string; summary: string }[] }>(textOf(r));
  return (parsed?.concepts ?? [])
    .filter((c) => c && typeof c.label === "string")
    .slice(0, 10)
    .map((c) => ({ label: c.label, summary: c.summary ?? "" }));
}

/** OCR / transcribe an image with Claude vision (no tesseract dependency). */
export async function transcribeImage(base64: string, mediaType: string): Promise<string> {
  const r = await anthropic.messages.create({
    model: model("fast"),
    max_tokens: 1500,
    system:
      "Transcribe ALL text and describe any diagrams/figures in this image so a student could study from it. Output plain text only.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as "image/png", data: base64 },
          },
          { type: "text", text: "Transcribe and describe this for study." },
        ],
      },
    ],
  });
  return textOf(r).trim();
}

/**
 * Upload a file to the Anthropic Files API for native citation at Q&A time.
 * Returns the file_id, or null if unavailable (ingestion never fails on this).
 */
export async function uploadToFilesApi(
  buffer: Buffer,
  filename: string,
  mediaType: string
): Promise<string | null> {
  try {
    const betaFiles = (
      anthropic as unknown as {
        beta?: { files?: { upload?: (body: unknown, opts?: unknown) => Promise<{ id?: string }> } };
      }
    ).beta?.files;
    if (!betaFiles?.upload) return null;
    const uploaded = await betaFiles.upload(
      { file: await toFile(buffer, filename, { type: mediaType }) },
      { headers: { "anthropic-beta": "files-api-2025-04-14" } }
    );
    return uploaded?.id ?? null;
  } catch {
    return null;
  }
}
