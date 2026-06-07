/**
 * Structure-aware chunking (BUILD_SPEC §6.1).
 * Splits each source "block" (a page / slide / file / transcript window) into
 * ~500–800-token chunks with ~100-token overlap, never crossing a block
 * boundary, and carries the block's `loc` so citations land precisely.
 * Token count is estimated as chars/4 (no embedding key needed for FTS).
 */

export type SourceBlock = {
  text: string;
  loc?: Record<string, unknown>;
};

export type Chunk = {
  ordinal: number;
  content: string;
  token_count: number;
  loc: Record<string, unknown>;
};

const TARGET_CHARS = 2800; // ~700 tokens
const MAX_CHARS = 3400; // hard ceiling (~850 tokens)
const OVERLAP_CHARS = 420; // ~105 tokens

const estTokens = (s: string) => Math.ceil(s.length / 4);

/** Split a block into paragraph-ish units, keeping sentence integrity. */
function splitUnits(text: string): string[] {
  const paras = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const para of paras) {
    if (para.length <= MAX_CHARS) {
      units.push(para);
      continue;
    }
    // Oversized paragraph → split on sentence boundaries.
    const sentences = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) ?? [para];
    let buf = "";
    for (const s of sentences) {
      if ((buf + s).length > MAX_CHARS && buf) {
        units.push(buf.trim());
        buf = "";
      }
      buf += s;
    }
    if (buf.trim()) units.push(buf.trim());
  }
  return units;
}

export function chunkBlocks(blocks: SourceBlock[]): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;

  for (const block of blocks) {
    const loc = block.loc ?? {};
    const units = splitUnits(block.text);
    let buf = "";

    const flush = () => {
      const content = buf.trim();
      if (!content) return;
      chunks.push({ ordinal: ordinal++, content, token_count: estTokens(content), loc });
      // Carry an overlap tail into the next chunk for retrieval continuity.
      buf = content.length > OVERLAP_CHARS ? content.slice(-OVERLAP_CHARS) : "";
    };

    for (const unit of units) {
      // Don't flush a tiny buffer (e.g. a lone heading) — let it attach to the
      // following content so headings stay with their section.
      if (buf.length > 600 && (buf + "\n\n" + unit).length > TARGET_CHARS) flush();
      buf = buf ? `${buf}\n\n${unit}` : unit;
      if (buf.length >= MAX_CHARS) flush();
    }
    // final flush for the block (reset overlap so it doesn't bleed across blocks)
    const tail = buf.trim();
    if (tail) {
      chunks.push({ ordinal: ordinal++, content: tail, token_count: estTokens(tail), loc });
    }
    buf = "";
  }

  return chunks;
}
