import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkBlocks, type SourceBlock } from "./chunk";
import { parsePdf, parseOffice, parseCode, parseYouTube, parseGitHub } from "./parsers";
import {
  generateStarterQuestions,
  seedConcepts,
  transcribeImage,
  uploadToFilesApi,
} from "@/lib/ai/ingest-ai";

export type IngestJob = {
  documentId: string;
  sourceId: string;
  ownerId: string;
  kind: string;
  storagePath?: string | null;
  externalUrl?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  text?: string | null;
};

async function downloadBuffer(admin: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from("sources").download(path);
  if (error || !data) throw new Error("Could not read the uploaded file from storage.");
  return Buffer.from(await data.arrayBuffer());
}

async function extract(
  admin: SupabaseClient,
  job: IngestJob
): Promise<{ blocks: SourceBlock[]; claudeFileId?: string | null }> {
  switch (job.kind) {
    case "youtube":
      return { blocks: await parseYouTube(job.externalUrl!) };
    case "github":
      return { blocks: await parseGitHub(job.externalUrl!, process.env.GITHUB_TOKEN) };
    case "gdoc":
      throw new Error("Google Docs connection is coming soon — paste the text for now.");
    case "text":
      return { blocks: job.text && job.text.trim() ? [{ text: job.text, loc: {} }] : [] };
  }

  // File-backed kinds: pull the object from storage.
  if (!job.storagePath) throw new Error("Missing file for this source.");
  const buffer = await downloadBuffer(admin, job.storagePath);
  const filename = job.filename ?? "source";

  switch (job.kind) {
    case "pdf": {
      const blocks = await parsePdf(buffer);
      const claudeFileId = await uploadToFilesApi(buffer, filename, "application/pdf");
      return { blocks, claudeFileId };
    }
    case "image": {
      const mime = job.mimeType ?? "image/png";
      const text = await transcribeImage(buffer.toString("base64"), mime);
      const claudeFileId = await uploadToFilesApi(buffer, filename, mime);
      return { blocks: text ? [{ text, loc: { file_path: filename } }] : [], claudeFileId };
    }
    case "docx":
    case "pptx":
      return { blocks: await parseOffice(buffer) };
    case "code":
    case "notebook":
    case "markdown":
      return { blocks: parseCode(buffer.toString("utf8"), filename) };
    default:
      // Best-effort: treat unknown file as UTF-8 text.
      return { blocks: parseCode(buffer.toString("utf8"), filename) };
  }
}

/**
 * Run the full ingestion pipeline for one source, updating documents.status at
 * each stage so the UI can stream progress over Supabase Realtime.
 * Embeddings are intentionally skipped (Files-API + FTS retrieval strategy);
 * pgvector backfill can run later when an embedding key is configured.
 */
export async function processIngestion(admin: SupabaseClient, job: IngestJob): Promise<void> {
  const setStatus = (status: string, error?: string) =>
    admin
      .from("documents")
      .update({ status, error: error ?? null, updated_at: new Date().toISOString() })
      .eq("id", job.documentId);

  try {
    await setStatus("parsing");
    const { blocks, claudeFileId } = await extract(admin, job);
    if (!blocks.length) throw new Error("No readable content was found in this source.");

    await setStatus("chunking");
    const chunks = chunkBlocks(blocks);
    const rows = chunks.map((c) => ({
      source_id: job.sourceId,
      document_id: job.documentId,
      owner_id: job.ownerId,
      ordinal: c.ordinal,
      content: c.content,
      token_count: c.token_count,
      loc: c.loc,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from("chunks").insert(rows.slice(i, i + 200));
      if (error) throw new Error("Failed to store content: " + error.message);
    }

    await setStatus("embedding"); // brief — FTS is generated automatically; vectors deferred
    const sample = blocks.map((b) => b.text).join("\n\n");
    const [starter, concepts] = await Promise.all([
      generateStarterQuestions(sample).catch(() => [] as string[]),
      seedConcepts(sample).catch(() => [] as { label: string; summary: string }[]),
    ]);

    const docUpdate: Record<string, unknown> = { starter_questions: starter };
    if (claudeFileId) docUpdate.claude_file_id = claudeFileId;
    await admin.from("documents").update(docUpdate).eq("id", job.documentId);

    if (concepts.length) {
      await admin.from("concepts").insert(
        concepts.map((c) => ({
          document_id: job.documentId,
          owner_id: job.ownerId,
          label: c.label,
          summary: c.summary,
        }))
      );
    }

    await admin.from("sources").update({ status: "ready" }).eq("id", job.sourceId);
    await setStatus("ready");
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "Ingestion failed.";
    await admin.from("sources").update({ status: "failed" }).eq("id", job.sourceId);
    await setStatus("failed", message);
  }
}
