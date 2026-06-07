import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processIngestion } from "@/lib/ingest/process";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({
  kind: z.enum([
    "pdf", "image", "docx", "pptx", "code", "notebook", "markdown", "youtube", "github", "gdoc", "text",
  ]),
  title: z.string().trim().min(1).max(160),
  emoji: z.string().trim().max(8).optional(),
  // When present, the source is ADDED to this existing study space instead of
  // creating a new one — this is how a document holds multiple materials.
  documentId: z.string().uuid().optional(),
  storagePath: z.string().optional(),
  externalUrl: z.string().url().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { kind, title, emoji, documentId, storagePath, externalUrl, filename, mimeType, text } =
    parsed.data;

  const isUrlKind = kind === "youtube" || kind === "github" || kind === "gdoc";
  const isTextKind = kind === "text";
  if (isUrlKind && !externalUrl) {
    return NextResponse.json({ error: "A link is required for this source." }, { status: 400 });
  }
  if (isTextKind && (!text || text.trim().length < 20)) {
    return NextResponse.json({ error: "Paste at least a paragraph of text." }, { status: 400 });
  }
  if (!isUrlKind && !isTextKind && !storagePath) {
    return NextResponse.json({ error: "A file is required for this source." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the target study space: existing (ownership-checked) or new.
  let docId: string;
  if (documentId) {
    const { data: existing } = await supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .single();
    if (!existing) {
      return NextResponse.json({ error: "Study space not found." }, { status: 404 });
    }
    docId = existing.id;
    await admin
      .from("documents")
      .update({ status: "queued", updated_at: new Date().toISOString() })
      .eq("id", docId);
  } else {
    const { data: doc, error: docErr } = await admin
      .from("documents")
      .insert({ owner_id: user.id, title, emoji: emoji ?? null, status: "queued" })
      .select("id")
      .single();
    if (docErr || !doc) {
      return NextResponse.json({ error: "Could not create the study space." }, { status: 500 });
    }
    docId = doc.id;
  }

  const { data: src, error: srcErr } = await admin
    .from("sources")
    .insert({
      document_id: docId,
      owner_id: user.id,
      kind,
      title,
      storage_path: storagePath ?? null,
      external_url: externalUrl ?? null,
      status: "queued",
      meta: { filename: filename ?? null, mime: mimeType ?? null },
    })
    .select("id")
    .single();
  if (srcErr || !src) {
    return NextResponse.json({ error: "Could not register the source." }, { status: 500 });
  }

  // Fire-and-forget: process after responding. Status streams over Realtime.
  // (Production would hand this to a durable queue / Edge Function.)
  void processIngestion(admin, {
    documentId: docId,
    sourceId: src.id,
    ownerId: user.id,
    kind,
    storagePath: storagePath ?? null,
    externalUrl: externalUrl ?? null,
    filename: filename ?? null,
    mimeType: mimeType ?? null,
    text: text ?? null,
  });

  return NextResponse.json({ documentId: docId, sourceId: src.id });
}
