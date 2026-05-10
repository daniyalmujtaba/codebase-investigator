import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: string; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) {
      this.cache.delete(key);
      return null;
    }
    this.cache.set(key, { value: row.value, at: Date.now() });
    return row.value;
  }

  async set(key: string, value: string) {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.cache.set(key, { value, at: Date.now() });
  }

  async all() {
    const rows = await this.prisma.setting.findMany({ orderBy: { key: "asc" } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
