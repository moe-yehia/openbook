import { type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { retrieve, formatLoc } from "@/lib/rag/retrieve";
import { buildTutorSystem } from "@/lib/ai/tutor-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({
  documentId: z.string().uuid(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(40),
});

const line = (obj: unknown) => JSON.stringify(obj) + "\n";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return new Response(parsed.error.issues[0].message, { status: 400 });
  const { documentId, messages } = parsed.data;

  // Document (RLS-scoped) + the student's chosen voice register.
  const { data: doc } = await supabase
    .from("documents")
    .select("id, title")
    .eq("id", documentId)
    .single();
  if (!doc) return new Response("Not found", { status: 404 });

  const { data: profile } = await supabase.from("profiles").select("prefs").eq("id", user.id).single();
  const register = (profile?.prefs as { register?: string } | null)?.register ?? null;

  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const chunks = await retrieve(supabase, documentId, lastUser, 6);
  const system = buildTutorSystem(chunks, doc.title, register);

  const citations = chunks.map((c) => ({
    n: c.n,
    loc: c.loc,
    locLabel: formatLoc(c.loc),
    content: c.content.slice(0, 1200),
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (s: string) => {
        if (!closed) controller.enqueue(encoder.encode(s));
      };
      const safeClose = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      safeEnqueue(line({ type: "citations", items: citations }));

      const ms = anthropic.messages.stream({
        model: model("balanced"),
        max_tokens: 2048,
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      ms.on("text", (t) => safeEnqueue(line({ type: "delta", text: t })));

      try {
        await ms.finalMessage();
        safeEnqueue(line({ type: "done" }));
      } catch (e) {
        safeEnqueue(
          line({ type: "error", message: e instanceof Error ? e.message : "Tutor error." })
        );
      } finally {
        safeClose();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
