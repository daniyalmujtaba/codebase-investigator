import { Body, Controller, Get, Headers, HttpException, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { SettingsService } from "./settings.service";

const ALLOWED_KEYS = new Set(["agent_model", "auditor_model", "embedding_model"]);

const UpsertDto = z.object({ key: z.string(), value: z.string() });

@Controller("admin/settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly cfg: ConfigService) {}

  private guard(token?: string) {
    const expected = this.cfg.get<string>("ADMIN_TOKEN");
    if (!expected) throw new HttpException("ADMIN_TOKEN not configured", 503);
    if (token !== expected) throw new HttpException("forbidden", 403);
  }

  @Get()
  async list(@Headers("x-admin-token") token?: string) {
    this.guard(token);
    return this.settings.all();
  }

  @Post()
  async upsert(@Headers("x-admin-token") token: string | undefined, @Body() body: unknown) {
    this.guard(token);
    const { key, value } = UpsertDto.parse(body);
    if (!ALLOWED_KEYS.has(key)) throw new HttpException(`unsupported key: ${key}`, 400);
    await this.settings.set(key, value);
    return { ok: true, key, value };
  }
}
