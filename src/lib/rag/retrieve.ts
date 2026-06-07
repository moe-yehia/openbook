import type { SupabaseClient } from "@supabase/supabase-js";

export type RetrievedChunk = {
  n: number; // 1-based citation index
  id: string;
  content: string;
  loc: Record<string, unknown>;
  source_id: string;
};

/** Human-readable citation locator from a chunk's loc. */
export function formatLoc(loc: Record<string, unknown>): string {
  if (!loc) return "source";
  if (typeof loc.page === "number") return `p.${loc.page}`;
  if (typeof loc.t_start_sec === "number") {
    const s = loc.t_start_sec as number;
    const m = Math.floor(s / 60);
    const r = String(s % 60).padStart(2, "0");
    return `${m}:${r}`;
  }
  if (typeof loc.file_path === "string") return loc.file_path as string;
  if (typeof loc.slide === "number") return `slide ${loc.slide}`;
  return "source";
}

/**
 * Retrieve the most relevant chunks for a query within one document.
 * Uses Postgres full-text search (no embedding key needed); falls back to the
 * opening chunks when the query is empty or matches nothing. RLS-scoped via the
 * caller's client.
 */
export async function retrieve(
  client: SupabaseClient,
  documentId: string,
  query: string,
  k = 6
): Promise<RetrievedChunk[]> {
  const base = client
    .from("chunks")
    .select("id, content, loc, source_id")
    .eq("document_id", documentId);

  let rows: { id: string; content: string; loc: Record<string, unknown>; source_id: string }[] = [];

  const q = query.trim();
  if (q.length > 1) {
    const { data } = await base
      .textSearch("fts", q, { type: "websearch", config: "english" })
      .limit(k);
    rows = data ?? [];
  }

  if (rows.length === 0) {
    // Fallback: opening chunks give the model orienting context.
    const { data } = await client
      .from("chunks")
      .select("id, content, loc, source_id")
      .eq("document_id", documentId)
      .order("ordinal", { ascending: true })
      .limit(k);
    rows = data ?? [];
  }

  return rows.map((r, i) => ({ n: i + 1, ...r }));
}
