import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import simpleGit from "simple-git";
import { createHash } from "crypto";
import { mkdir, stat } from "fs/promises";
import { join, resolve as pathResolve } from "path";
import { SkeletonService } from "./skeleton.service";

function parseGithubUrl(url: string): { owner: string; name: string } {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
  if (!m) throw new Error(`Not a recognizable GitHub URL: ${url}`);
  return { owner: m[1], name: m[2] };
}

@Injectable()
export class ReposService {
  private readonly log = new Logger(ReposService.name);
  private readonly cacheDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly skeleton: SkeletonService,
  ) {
    this.cacheDir = pathResolve(this.cfg.get<string>("REPO_CACHE_DIR") ?? "./.cache/repos");
  }

  async ensure(url: string) {
    const { owner, name } = parseGithubUrl(url);
    const key = createHash("sha1").update(url.toLowerCase()).digest("hex").slice(0, 12);
    const cachePath = join(this.cacheDir, `${owner}__${name}__${key}`);

    const existing = await this.prisma.repo.findUnique({ where: { url } });
    if (existing) {
      try {
        await stat(existing.cachePath);
        return existing;
      } catch {
        // cache missing — re-clone below
      }
    }

    await mkdir(this.cacheDir, { recursive: true });
    this.log.log(`cloning ${url} → ${cachePath}`);
    await simpleGit().clone(url, cachePath, ["--depth", "1"]);
    const head = await simpleGit(cachePath).revparse(["HEAD"]);

    const repo = existing
      ? await this.prisma.repo.update({
          where: { id: existing.id },
          data: { cachePath, ref: head.trim() },
        })
      : await this.prisma.repo.create({
          data: { url, owner, name, ref: head.trim(), cachePath },
        });

    if (!repo.skeletonAt) {
      // Build skeleton in background — don't block session creation.
      this.skeleton
        .build(repo.id, cachePath)
        .catch((e) => this.log.error(`skeleton build failed: ${e.message}`));
    }
    return repo;
  }
}
