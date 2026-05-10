import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { OpenAIProvider } from "./openai.provider";
import type { LlmCallRequest, LlmCallResponse, LlmProvider } from "./llm.types";

const PRICES: Record<string, { in: number; out: number }> = {
  // USD per 1K tokens. Free tiers listed as 0/0.
  "gpt-5": { in: 0.005, out: 0.015 },
  "gpt-5-mini": { in: 0.0008, out: 0.0024 },
  "gpt-4o": { in: 0.0025, out: 0.01 },
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "gemini-2.0-flash": { in: 0, out: 0 },
  "gemini-2.0-flash-lite": { in: 0, out: 0 },
  "gemini-2.5-flash": { in: 0, out: 0 },
  "llama-3.3-70b-versatile": { in: 0, out: 0 },
  "llama-3.1-8b-instant": { in: 0, out: 0 },
};

interface ProviderEnv {
  id: string;
  apiKeyVar: string;
  baseUrlVar?: string;
  defaultBaseUrl?: string;
  // Some compat endpoints reject `strict: true` on json_schema. Set false to disable.
  strictJsonSchema?: boolean;
}

const PROVIDER_DEFS: ProviderEnv[] = [
  { id: "openai", apiKeyVar: "OPENAI_API_KEY", baseUrlVar: "OPENAI_BASE_URL", defaultBaseUrl: "https://api.openai.com/v1", strictJsonSchema: true },
  { id: "gemini", apiKeyVar: "GEMINI_API_KEY", baseUrlVar: "GEMINI_BASE_URL", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", strictJsonSchema: false },
  { id: "groq",   apiKeyVar: "GROQ_API_KEY",   baseUrlVar: "GROQ_BASE_URL",   defaultBaseUrl: "https://api.groq.com/openai/v1", strictJsonSchema: false },
  { id: "openai-compat", apiKeyVar: "OPENAI_COMPAT_API_KEY", baseUrlVar: "OPENAI_COMPAT_BASE_URL", strictJsonSchema: false },
];

export interface ResolvedModel {
  providerId: string;
  model: string;
}

@Injectable()
export class LlmService {
  private readonly providers = new Map<string, LlmProvider>();
  private readonly log = new Logger(LlmService.name);

  private readonly strictByProvider = new Map<string, boolean>();

  constructor(
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {
    for (const def of PROVIDER_DEFS) {
      const apiKey = this.cfg.get<string>(def.apiKeyVar);
      if (!apiKey) continue;
      const baseURL = def.baseUrlVar ? this.cfg.get<string>(def.baseUrlVar) : undefined;
      const resolvedBase = baseURL || def.defaultBaseUrl;
      if (def.id === "openai-compat" && !resolvedBase) continue; // generic slot needs explicit URL
      this.providers.set(
        def.id,
        new OpenAIProvider({
          providerId: def.id,
          apiKey,
          baseURL: resolvedBase,
          strictJsonSchema: def.strictJsonSchema ?? true,
        }),
      );
      this.strictByProvider.set(def.id, def.strictJsonSchema ?? true);
      this.log.log(`registered provider "${def.id}"${resolvedBase ? ` @ ${resolvedBase}` : ""}`);
    }
    if (!this.providers.size) {
      this.log.warn("no LLM providers configured — set at least one of OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, OPENAI_COMPAT_API_KEY");
    }
  }

  resolve(spec: string): ResolvedModel {
    const [providerId, ...rest] = spec.split(":");
    const model = rest.join(":");
    if (!providerId || !model) {
      throw new Error(`Invalid model spec: "${spec}". Expected "<provider>:<model>".`);
    }
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider "${providerId}" not configured. Check env.`);
    }
    return { providerId, model };
  }

  async agentModel(): Promise<ResolvedModel> {
    const override = await this.settings.get("agent_model");
    return this.resolve(override ?? this.cfg.get<string>("AGENT_MODEL") ?? "gemini:gemini-2.0-flash");
  }
  async auditorModel(): Promise<ResolvedModel> {
    const override = await this.settings.get("auditor_model");
    return this.resolve(override ?? this.cfg.get<string>("AUDITOR_MODEL") ?? "groq:llama-3.3-70b-versatile");
  }
  async embeddingModel(): Promise<ResolvedModel> {
    const override = await this.settings.get("embedding_model");
    return this.resolve(override ?? this.cfg.get<string>("EMBEDDING_MODEL") ?? "gemini:text-embedding-004");
  }

  async call(
    role: "agent" | "auditor",
    rm: ResolvedModel,
    req: LlmCallRequest,
    ctx: { sessionId?: string; messageId?: string } = {},
  ): Promise<LlmCallResponse> {
    const provider = this.providers.get(rm.providerId);
    if (!provider) throw new Error(`Provider not configured: ${rm.providerId}`);
    const t0 = Date.now();
    const res = await provider.call(rm.model, req);
    const latencyMs = Date.now() - t0;
    const price = PRICES[rm.model];
    const costUsd = price
      ? (res.promptTokens * price.in + res.outputTokens * price.out) / 1000
      : null;
    try {
      await this.prisma.llmCall.create({
        data: {
          sessionId: ctx.sessionId ?? null,
          messageId: ctx.messageId ?? null,
          role,
          provider: rm.providerId,
          model: rm.model,
          promptTokens: res.promptTokens,
          outputTokens: res.outputTokens,
          latencyMs,
          costUsd,
        },
      });
    } catch (e) {
      this.log.warn(`failed to log llm call: ${(e as Error).message}`);
    }
    return res;
  }
}
