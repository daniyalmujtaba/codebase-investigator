import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InvestigationCacheService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(toolName: string, args: unknown): string {
    return createHash("sha1")
      .update(toolName + ":" + JSON.stringify(args ?? {}))
      .digest("hex")
      .slice(0, 16);
  }

  async get(sessionId: string, toolName: string, args: unknown): Promise<unknown | null> {
    const argsHash = this.hash(toolName, args);
    const row = await this.prisma.investigationCache.findUnique({
      where: { sessionId_toolName_argsHash: { sessionId, toolName, argsHash } },
    });
    return row?.result ?? null;
  }

  async set(sessionId: string, toolName: string, args: unknown, result: unknown): Promise<void> {
    const argsHash = this.hash(toolName, args);
    try {
      await this.prisma.investigationCache.upsert({
        where: { sessionId_toolName_argsHash: { sessionId, toolName, argsHash } },
        update: { result: result as object },
        create: { sessionId, toolName, argsHash, result: result as object },
      });
    } catch { /* best-effort */ }
  }

  async readsSummary(sessionId: string): Promise<string> {
    const rows = await this.prisma.investigationCache.findMany({
      where: { sessionId, toolName: "read_file" },
      orderBy: { createdAt: "asc" },
    });
    if (!rows.length) return "";
    const items: string[] = [];
    for (const r of rows) {
      const res = r.result as { path?: string; startLine?: number; endLine?: number };
      if (res?.path) items.push(`${res.path}:${res.startLine ?? "?"}-${res.endLine ?? "?"}`);
    }
    return items.join(", ");
  }
}
