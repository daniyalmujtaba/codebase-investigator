export interface LlmTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: { id: string; name: string; arguments: string }[];
}

export interface LlmCallRequest {
  messages: LlmMessage[];
  tools?: LlmTool[];
  toolChoice?: "auto" | "required" | "none";
  responseFormat?: { type: "json_schema"; schema: Record<string, unknown>; name: string };
  temperature?: number;
  maxTokens?: number;
}

export interface LlmCallResponse {
  content: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  promptTokens: number;
  outputTokens: number;
  finishReason: string;
  raw: unknown;
}

export interface LlmProvider {
  readonly providerId: string;
  call(model: string, req: LlmCallRequest): Promise<LlmCallResponse>;
}
