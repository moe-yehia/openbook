import type { SourceBlock } from "./chunk";

/** PDF → one block per page (page loc for precise citations). */
export async function parsePdf(data: Uint8Array): Promise<SourceBlock[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages
    .map((t, i) => ({ text: (t ?? "").trim(), loc: { page: i + 1 } }))
    .filter((b) => b.text.length > 0);
}

/** Word / PowerPoint (and other Office formats) via officeparser (v7 AST). */
function collectText(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collectText(n, out);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.trim()) out.push(obj.text);
    for (const key of ["content", "children", "rows", "cells", "runs", "items", "paragraphs"]) {
      if (obj[key]) collectText(obj[key], out);
    }
  }
}

export async function parseOffice(buffer: Buffer): Promise<SourceBlock[]> {
  const { parseOffice: parse } = await import("officeparser");
  const ast = await parse(buffer);
  const out: string[] = [];
  collectText((ast as { content?: unknown }).content, out);
  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? [{ text, loc: {} }] : [];
}

/** Code / Markdown / Jupyter notebooks. */
export function parseCode(raw: string, filePath: string): SourceBlock[] {
  if (filePath.endsWith(".ipynb")) {
    try {
      const nb = JSON.parse(raw);
      const blocks: SourceBlock[] = [];
      (nb.cells ?? []).forEach((cell: { cell_type: string; source: string[] | string }, i: number) => {
        const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "";
        if (!src.trim()) return;
        const text = cell.cell_type === "code" ? "```\n" + src + "\n```" : src;
        blocks.push({ text, loc: { file_path: filePath, cell: i, kind: cell.cell_type } });
      });
      return blocks;
    } catch {
      /* fall through to raw */
    }
  }
  return raw.trim() ? [{ text: raw, loc: { file_path: filePath } }] : [];
}

function youtubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ||
    url.match(/youtu\.be\/([\w-]{11})/) ||
    url.match(/embed\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** YouTube transcript → ~45s windows with timestamp loc. */
export async function parseYouTube(url: string): Promise<SourceBlock[]> {
  const id = youtubeId(url);
  if (!id) throw new Error("Could not read a YouTube video id from that link.");
  const { YoutubeTranscript } = await import("youtube-transcript");
  const segments = await YoutubeTranscript.fetchTranscript(id);
  if (!segments.length) throw new Error("No transcript is available for this video.");

  const WINDOW = 45_000; // ms
  const blocks: SourceBlock[] = [];
  let bucketStart = 0;
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    blocks.push({
      text: buf.join(" ").replace(/\s+/g, " ").trim(),
      loc: { t_start_sec: Math.round(bucketStart / 1000) },
    });
    buf = [];
  };
  for (const s of segments) {
    const offset = typeof s.offset === "number" ? s.offset : 0;
    if (offset - bucketStart >= WINDOW && buf.length) {
      flush();
      bucketStart = offset;
    }
    buf.push(s.text);
  }
  flush();
  return blocks;
}

const TEXT_EXT =
  /\.(md|markdown|txt|rst|js|jsx|ts|tsx|py|java|go|rb|rs|c|cc|cpp|h|hpp|cs|php|swift|kt|scala|sh|bash|sql|json|ya?ml|toml|html|css|scss|ipynb)$/i;

/** GitHub repo → one block per text file (line loc). Public repos; optional token. */
export async function parseGitHub(url: string, token?: string): Promise<SourceBlock[]> {
  const m = url.match(/github\.com\/([^/]+)\/([^/#?]+)/);
  if (!m) throw new Error("That doesn't look like a GitHub repository URL.");
  const owner = m[1];
  const repo = m[2].replace(/\.git$/, "");

  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit(token ? { auth: token } : {});

  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const branch = repoData.default_branch;
  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  const EXTRA = /(^|\/)(README|LICENSE|CHANGELOG|Dockerfile|Makefile)(\.[\w-]+)?$/i;
  const files = (tree.tree ?? [])
    .filter(
      (n) =>
        n.type === "blob" &&
        n.path &&
        (n.size ?? 0) < 120_000 &&
        (TEXT_EXT.test(n.path) || EXTRA.test(n.path))
    )
    .slice(0, 40);

  const blocks: SourceBlock[] = [];
  for (const f of files) {
    if (!f.sha || !f.path) continue;
    try {
      const { data: blob } = await octokit.git.getBlob({ owner, repo, file_sha: f.sha });
      const content =
        blob.encoding === "base64"
          ? Buffer.from(blob.content, "base64").toString("utf8")
          : blob.content;
      if (content.trim()) {
        const header = `// ${f.path}\n`;
        blocks.push({ text: header + content, loc: { file_path: f.path } });
      }
    } catch {
      /* skip unreadable blob */
    }
  }
  if (!blocks.length) throw new Error("No readable text files were found in that repository.");
  return blocks;
}
