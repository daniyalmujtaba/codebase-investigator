import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import type { LlmCallRequest, LlmCallResponse, LlmProvider } from "./llm.types";

@Injectable()
export class OpenAIProvider implements LlmProvider {
  readonly providerId: string;
  private readonly client: OpenAI;
  private readonly log = new Logger(OpenAIProvider.name);

  private readonly strictJsonSchema: boolean;

  constructor(opts: { providerId: string; apiKey: string; baseURL?: string; strictJsonSchema?: boolean }) {
    this.providerId = opts.providerId;
    this.strictJsonSchema = opts.strictJsonSchema ?? true;
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  }

  private async callWithRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e: unknown) {
        lastErr = e;
        const status = (e as { status?: number })?.status;
        const retriable = status === 429 || (status !== undefined && status >= 500 && status < 600);
        if (!retriable || attempt === maxAttempts) throw e;
        const retryAfterHeader = (e as { headers?: Record<string, string> })?.headers?.["retry-after"];
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000) + Math.random() * 500;
        const waitMs = Math.max(retryAfterMs, backoffMs);
        this.log.warn(`[${this.providerId}] ${status} — retry ${attempt}/${maxAttempts - 1} in ${Math.round(waitMs)}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw lastErr;
  }

  async call(model: string, req: LlmCallRequest): Promise<LlmCallResponse> {
    const messages = req.messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool" as const, content: m.content, tool_call_id: m.tool_call_id! };
      }
      if (m.role === "assistant" && m.tool_calls?.length) {
        return {
          role: "assistant" as const,
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        };
      }
      return { role: m.role as "system" | "user" | "assistant", content: m.content };
    });

    const tools = req.tools?.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    const body: Record<string, unknown> = {
      model,
      messages,
      ...(tools ? { tools, tool_choice: req.toolChoice ?? "auto" } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
    };

    if (req.responseFormat) {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: req.responseFormat.name,
          schema: req.responseFormat.schema,
          ...(this.strictJsonSchema ? { strict: true } : {}),
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await this.callWithRetry(() => (this.client.chat.completions as any).create(body));
    const choice = res.choices?.[0];
    const msg = choice?.message ?? {};
    const toolCalls =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (msg.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name ?? "",
        arguments: tc.function?.arguments ?? "{}",
      }));
    return {
      content: msg.content ?? "",
      toolCalls,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      finishReason: choice?.finish_reason ?? "stop",
      raw: res,
    };
  }
}
