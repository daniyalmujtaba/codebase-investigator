import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { LlmService } from "../llm/llm.service";

@Injectable()
export class EmbeddingsService {
  private readonly log = new Logger(EmbeddingsService.name);
  private readonly clients = new Map<string, OpenAI>();

  constructor(private readonly cfg: ConfigService, private readonly llm: LlmService) {}

  private clientFor(providerId: string): OpenAI {
    if (this.clients.has(providerId)) return this.clients.get(providerId)!;
    const map: Record<string, { keyVar: string; baseVar?: string; defaultBase?: string }> = {
      openai: { keyVar: "OPENAI_API_KEY", baseVar: "OPENAI_BASE_URL", defaultBase: "https://api.openai.com/v1" },
      gemini: { keyVar: "GEMINI_API_KEY", baseVar: "GEMINI_BASE_URL", defaultBase: "https://generativelanguage.googleapis.com/v1beta/openai/" },
      "openai-compat": { keyVar: "OPENAI_COMPAT_API_KEY", baseVar: "OPENAI_COMPAT_BASE_URL" },
    };
    const def = map[providerId];
    if (!def) throw new Error(`embeddings provider not supported: ${providerId}`);
    const apiKey = this.cfg.get<string>(def.keyVar);
    if (!apiKey) throw new Error(`missing env: ${def.keyVar}`);
    const baseURL = (def.baseVar ? this.cfg.get<string>(def.baseVar) : undefined) || def.defaultBase;
    const client = new OpenAI({ apiKey, baseURL });
    this.clients.set(providerId, client);
    return client;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const m = await this.llm.embeddingModel();
    const client = this.clientFor(m.providerId);
    // Batch in chunks to be safe across providers.
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 96) {
      const batch = texts.slice(i, i + 96).map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));
      const res = await client.embeddings.create({ model: m.model, input: batch });
      for (const d of res.data) out.push(d.embedding as number[]);
    }
    return out;
  }
}
