import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";
import { PrismaService } from "../prisma/prisma.service";
import { LlmService } from "../llm/llm.service";
import { EmbeddingsService } from "../embeddings/embeddings.service";

const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".cache", ".venv", "__pycache__", "vendor"]);
const MAX_FILES = 60;
const MAX_BYTES_PER_FILE = 6000;

const PRIORITY_PATTERNS = [
  /^README/i,
  /^package\.json$/,
  /^pyproject\.toml$/,
  /^Cargo\.toml$/,
  /^go\.mod$/,
  /^src\/(index|main|app)\.[tj]sx?$/,
  /^app\/(layout|page|route)\.[tj]sx?$/,
  /^src\/.*(router|routes|controller|service|module)/i,
  /^lib\/.*\.[tj]sx?$/,
];

interface PickedFile { path: string; bytes: number; }

@Injectable()
export class SkeletonService {
  private readonly log = new Logger(SkeletonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  private async listFiles(root: string): Promise<PickedFile[]> {
    return new Promise((resolveP, rejectP) => {
      const args = ["--files", "--color=never"];
      for (const d of IGNORE_DIRS) args.push("--glob", `!${d}/**`);
      const p = spawn("rg", args, { cwd: root });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", rejectP);
      p.on("close", async (code) => {
        if (code !== 0 && code !== 1) return rejectP(new Error(err || `rg exited ${code}`));
        const paths = out.split("\n").filter(Boolean);
        const picked: PickedFile[] = [];
        const seen = new Set<string>();
        // Priority pass.
        for (const p of paths) {
          if (PRIORITY_PATTERNS.some((rx) => rx.test(p))) {
            picked.push({ path: p, bytes: 0 });
            seen.add(p);
            if (picked.length >= MAX_FILES) break;
          }
        }
        // Fill with shallow files (depth <= 2) until cap.
        for (const p of paths) {
          if (picked.length >= MAX_FILES) break;
          if (seen.has(p)) continue;
          if (p.split("/").length <= 3) {
            picked.push({ path: p, bytes: 0 });
            seen.add(p);
          }
        }
        resolveP(picked);
      });
    });
  }

  private async summarize(repoRoot: string, files: PickedFile[]): Promise<{ path: string; summary: string }[]> {
    const inputs: { path: string; content: string }[] = [];
    for (const f of files) {
      try {
        const buf = await readFile(join(repoRoot, f.path), "utf8");
        inputs.push({ path: f.path, content: buf.length > MAX_BYTES_PER_FILE ? buf.slice(0, MAX_BYTES_PER_FILE) : buf });
      } catch { /* skip */ }
    }
    if (!inputs.length) return [];

    const prompt = `For each file below, write ONE short sentence (max 18 words) describing what the file does. Return JSON: {"summaries":[{"path":"...","summary":"..."}]}. Files:\n\n` +
      inputs.map((x) => `### ${x.path}\n${x.content}`).join("\n\n");

    const model = await this.llm.auditorModel();
    const res = await this.llm.call(
      "auditor",
      model,
      {
        messages: [
          { role: "system", content: "You write extremely terse one-line file summaries for code repositories." },
          { role: "user", content: prompt },
        ],
        responseFormat: {
          type: "json_schema",
          name: "FileSummaries",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summaries: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { path: { type: "string" }, summary: { type: "string" } },
                  required: ["path", "summary"],
                },
              },
            },
            required: ["summaries"],
          },
        },
        temperature: 0,
      },
    );
    try {
      const parsed = JSON.parse(res.content || "{}") as { summaries?: { path: string; summary: string }[] };
      return parsed.summaries ?? [];
    } catch {
      return inputs.map((x) => ({ path: x.path, summary: "(summary unavailable)" }));
    }
  }

  private renderSkeleton(root: string, items: { path: string; summary: string }[]): string {
    const lines = [`# ${root.split("/").slice(-1)[0]} — repo skeleton`, ""];
    for (const it of items.sort((a, b) => a.path.localeCompare(b.path))) {
      lines.push(`- \`${it.path}\` — ${it.summary}`);
    }
    return lines.join("\n");
  }

  async build(repoId: string, repoRoot: string): Promise<void> {
    this.log.log(`building skeleton for ${repoId}`);
    const files = await this.listFiles(repoRoot);
    const summaries = await this.summarize(repoRoot, files);
    if (!summaries.length) {
      this.log.warn(`skeleton: no summaries produced for ${repoId}`);
      return;
    }
    let embeddings: number[][] = [];
    try {
      embeddings = await this.embeddings.embed(summaries.map((s) => `${s.path}: ${s.summary}`));
    } catch (e) {
      this.log.warn(`embeddings failed (continuing without vectors): ${(e as Error).message}`);
    }

    await this.prisma.fileSummary.deleteMany({ where: { repoId } });
    for (let i = 0; i < summaries.length; i++) {
      const s = summaries[i];
      const v = embeddings[i];
      await this.prisma.fileSummary.create({
        data: { repoId, path: s.path, summary: s.summary },
      });
      if (v && v.length === 768) {
        const literal = `[${v.join(",")}]`;
        await this.prisma.$executeRawUnsafe(
          `UPDATE "FileSummary" SET "embedding" = $1::vector WHERE "repoId" = $2 AND "path" = $3`,
          literal,
          repoId,
          s.path,
        );
      }
    }

    const skeleton = this.renderSkeleton(repoRoot, summaries);
    await this.prisma.repo.update({
      where: { id: repoId },
      data: { skeleton, skeletonAt: new Date() },
    });
    this.log.log(`skeleton built: ${summaries.length} files, ${embeddings.length} embedded`);
  }

  async selectFiles(repoId: string, query: string, k = 12): Promise<{ path: string; summary: string; score: number }[]> {
    const v = (await this.embeddings.embed([query]))[0];
    if (!v) return [];
    const literal = `[${v.join(",")}]`;
    const rows = await this.prisma.$queryRawUnsafe<{ path: string; summary: string; distance: number }[]>(
      `SELECT "path", "summary", ("embedding" <=> $1::vector) AS distance
       FROM "FileSummary"
       WHERE "repoId" = $2 AND "embedding" IS NOT NULL
       ORDER BY "embedding" <=> $1::vector
       LIMIT $3`,
      literal,
      repoId,
      k,
    );
    return rows.map((r) => ({ path: r.path, summary: r.summary, score: 1 - r.distance }));
  }
}
