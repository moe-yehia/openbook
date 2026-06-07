"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(160),
  emoji: z.string().trim().max(8).optional(),
  kind: z.enum(["text", "youtube", "github", "gdoc"]),
  text: z.string().trim().optional(),
  url: z.string().url().optional(),
});

export type CreateDocState = { error?: string };

/**
 * Create a study space (document) from pasted text or a connected URL.
 * Writes are RLS-scoped: owner_id must equal auth.uid(). Text sources are
 * stored immediately as a single chunk (status 'ready'); URL sources are queued
 * for the ingestion pipeline (Phase 2c).
 */
export async function createDocument(
  _prev: CreateDocState,
  formData: FormData
): Promise<CreateDocState> {
  const parsed = schema.safeParse({
    title: formData.get("title"),
    emoji: formData.get("emoji") || undefined,
    kind: formData.get("kind"),
    text: formData.get("text") || undefined,
    url: formData.get("url") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { title, emoji, kind, text, url } = parsed.data;

  if (kind === "text" && (!text || text.length < 20)) {
    return { error: "Paste at least a paragraph of text to study." };
  }
  if (kind !== "text" && !url) {
    return { error: "Paste a valid link." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired — please sign in again." };

  const ready = kind === "text";
  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .insert({ owner_id: user.id, title, emoji: emoji ?? null, status: ready ? "ready" : "queued" })
    .select("id")
    .single();
  if (docErr || !doc) return { error: docErr?.message ?? "Could not create the study space." };

  const { data: src, error: srcErr } = await supabase
    .from("sources")
    .insert({
      document_id: doc.id,
      owner_id: user.id,
      kind,
      title,
      external_url: kind === "text" ? null : url,
      status: ready ? "ready" : "queued",
    })
    .select("id")
    .single();
  if (srcErr) return { error: srcErr.message };

  if (kind === "text" && text && src) {
    // Naive paragraph chunking for the instant-text path; the real pipeline
    // (structure-aware + embeddings) lands in Phase 2c.
    const paras = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    const rows = (paras.length ? paras : [text]).map((content, ordinal) => ({
      source_id: src.id,
      document_id: doc.id,
      owner_id: user.id,
      ordinal,
      content,
      token_count: Math.ceil(content.length / 4),
      loc: { char_start: 0, char_end: content.length },
    }));
    await supabase.from("chunks").insert(rows);
  }

  revalidatePath("/library");
  revalidatePath("/dashboard");
  redirect(`/library?created=${doc.id}`);
}
