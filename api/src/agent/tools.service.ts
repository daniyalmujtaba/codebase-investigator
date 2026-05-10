import { Injectable } from "@nestjs/common";
import { readdir, readFile, stat } from "fs/promises";
import { join, relative, resolve as pathResolve, sep } from "path";
import { spawn } from "child_process";

const IGNORE_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".cache", ".venv", "__pycache__"]);
const MAX_READ_LINES = 400;
const MAX_GREP_HITS = 80;
const MAX_FIND_HITS = 200;

function safeJoin(root: string, p: string): string {
  const abs = pathResolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error(`path escapes repo root: ${p}`);
  }
  return abs;
}

@Injectable()
export class ToolsService {
  async listDir(root: string, path: string) {
    const abs = safeJoin(root, path || ".");
    const entries = await readdir(abs, { withFileTypes: true });
    const items = entries
      .filter((e) => !IGNORE_DIRS.has(e.name))
      .map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    return { path: path || ".", entries: items };
  }

  async readFile(root: string, path: string, start?: number, end?: number) {
    const abs = safeJoin(root, path);
    const buf = await readFile(abs, "utf8");
    const lines = buf.split("\n");
    const s = Math.max(1, start ?? 1);
    const e = Math.min(lines.length, end ?? Math.min(lines.length, s + MAX_READ_LINES - 1));
    if (e - s + 1 > MAX_READ_LINES) {
      return { path, startLine: s, endLine: s + MAX_READ_LINES - 1, total: lines.length, truncated: true, content: lines.slice(s - 1, s - 1 + MAX_READ_LINES).join("\n") };
    }
    return { path, startLine: s, endLine: e, total: lines.length, truncated: false, content: lines.slice(s - 1, e).join("\n") };
  }

  grep(root: string, pattern: string, glob?: string): Promise<{ matches: { file: string; line: number; text: string }[]; truncated: boolean }> {
    return new Promise((resolveP, rejectP) => {
      const args = ["--no-heading", "--line-number", "--color=never", "-S", "--max-count", "20"];
      if (glob) args.push("--glob", glob);
      for (const d of IGNORE_DIRS) args.push("--glob", `!${d}/**`);
      args.push(pattern, ".");
      const p = spawn("rg", args, { cwd: root });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", rejectP);
      p.on("close", (code) => {
        if (code !== 0 && code !== 1) return rejectP(new Error(err || `rg exited ${code}`));
        const matches: { file: string; line: number; text: string }[] = [];
        for (const ln of out.split("\n")) {
          if (!ln) continue;
          const m = ln.match(/^(.+?):(\d+):(.*)$/);
          if (!m) continue;
          matches.push({ file: m[1], line: Number(m[2]), text: m[3] });
          if (matches.length >= MAX_GREP_HITS) break;
        }
        resolveP({ matches, truncated: matches.length >= MAX_GREP_HITS });
      });
    });
  }

  async findFiles(root: string, glob: string) {
    return new Promise<{ files: string[]; truncated: boolean }>((resolveP, rejectP) => {
      const args = ["--files", "--color=never", "--glob", glob];
      for (const d of IGNORE_DIRS) args.push("--glob", `!${d}/**`);
      const p = spawn("rg", args, { cwd: root });
      let out = "";
      let err = "";
      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", rejectP);
      p.on("close", (code) => {
        if (code !== 0 && code !== 1) return rejectP(new Error(err || `rg exited ${code}`));
        const files = out.split("\n").filter(Boolean).slice(0, MAX_FIND_HITS);
        resolveP({ files, truncated: files.length >= MAX_FIND_HITS });
      });
    });
  }
}

export { MAX_READ_LINES };
