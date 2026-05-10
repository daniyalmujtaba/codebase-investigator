import { Injectable, Logger } from "@nestjs/common";
import type { AgentAnswer, Claim, SseEvent } from "@ci/shared";
import { LlmService } from "../llm/llm.service";
import type { LlmMessage } from "../llm/llm.types";
import { ToolsService } from "./tools.service";
import { AGENT_TOOLS } from "./agent.tools-schema";
import { InvestigationCacheService } from "./cache.service";
import { SkeletonService } from "../repos/skeleton.service";

const SYSTEM_PROMPT = `You are a codebase investigator. The user pastes a public GitHub repo and asks questions in plain English.

Tools available:
- list_dir(path)
- read_file(path, startLine?, endLine?)
- grep(pattern, glob?)
- find_files(glob)
- select_files(query, k?) — semantic file selection (vector search over per-file summaries). USE THIS FIRST when you don't know where to look.
- submit_answer(answerMarkdown, claims, assumptions, openQuestions) — call this exactly once when ready.

Hard rules:
1. NEVER guess file paths or line numbers. Open files with read_file before citing them.
2. Every claim in submit_answer MUST be supported by >=1 citation referencing lines you have actually read.
3. Prefer many small read_file calls over one giant one. Read up to ~400 lines per call.
4. If you've already read a file in an earlier turn (see "Files you have already read" below), you do NOT need to read it again. Reference it directly when citing.
5. If the question is opinion/evaluation, ground the opinion in observed code (cite the code that motivated the opinion).
6. Keep answers tight. Use plain language. Skip the obvious. Do not pad.
7. If you previously committed to a claim in this session and your view has changed, say so explicitly in answerMarkdown.

Investigate concretely. When uncertain, say so in openQuestions or assumptions instead of bluffing.`;

const MAX_ITERATIONS = 16;
const MAX_TOOL_RESULT_BYTES = 12000;

export interface RunInput {
  repoId: string;
  repoRoot: string;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  ledgerSummary: string;
  skeleton: string | null;
  sessionId: string;
  messageId: string;
}

@Injectable()
export class AgentService {
  private readonly log = new Logger(AgentService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly tools: ToolsService,
    private readonly cache: InvestigationCacheService,
    private readonly skeleton: SkeletonService,
  ) {}

  async run(input: RunInput, emit: (e: SseEvent) => void): Promise<AgentAnswer> {
    const messages: LlmMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

    if (input.skeleton) {
      messages.push({
        role: "system",
        content: `Repo skeleton (per-file 1-line summaries — use as a map):\n${input.skeleton}`,
      });
    }

    const previousReads = await this.cache.readsSummary(input.sessionId);
    if (previousReads) {
      messages.push({
        role: "system",
        content: `Files you have already read in this session: ${previousReads}\nDo not re-read these unless you need a different range.`,
      });
    }

    if (input.ledgerSummary) {
      messages.push({
        role: "system",
        content: `Prior claims you have committed to in this session (stay consistent or explicitly revise):\n${input.ledgerSummary}`,
      });
    }

    for (const h of input.history) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: "user", content: input.userMessage });

    const model = await this.llm.agentModel();

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const res = await this.llm.call(
        "agent",
        model,
        { messages, tools: AGENT_TOOLS, toolChoice: "auto" },
        { sessionId: input.sessionId, messageId: input.messageId },
      );

      if (!res.toolCalls.length) {
        if (res.content) emit({ type: "token", text: res.content });
        messages.push({ role: "assistant", content: res.content });
        messages.push({
          role: "user",
          content: "Please call submit_answer with your final structured response now.",
        });
        continue;
      }

      messages.push({ role: "assistant", content: res.content, tool_calls: res.toolCalls });

      for (const tc of res.toolCalls) {
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(tc.arguments || "{}"); } catch { /* noop */ }
        emit({ type: "tool_call", name: tc.name, args: parsed });

        if (tc.name === "submit_answer") {
          const answer = parsed as unknown as AgentAnswer;
          answer.claims = (answer.claims ?? []).filter(
            (c: Claim) => c.citations && c.citations.length > 0,
          );
          emit({ type: "answer", answer });
          return answer;
        }

        let result: unknown;
        const cached = await this.cache.get(input.sessionId, tc.name, parsed);
        if (cached !== null) {
          result = { ...(cached as object), _cached: true };
        } else {
          try {
            if (tc.name === "list_dir") {
              result = await this.tools.listDir(input.repoRoot, String(parsed.path ?? "."));
            } else if (tc.name === "read_file") {
              result = await this.tools.readFile(
                input.repoRoot,
                String(parsed.path),
                parsed.startLine as number | undefined,
                parsed.endLine as number | undefined,
              );
            } else if (tc.name === "grep") {
              result = await this.tools.grep(
                input.repoRoot,
                String(parsed.pattern),
                parsed.glob as string | undefined,
              );
            } else if (tc.name === "find_files") {
              result = await this.tools.findFiles(input.repoRoot, String(parsed.glob));
            } else if (tc.name === "select_files") {
              result = {
                files: await this.skeleton.selectFiles(
                  input.repoId,
                  String(parsed.query),
                  (parsed.k as number) ?? 12,
                ),
              };
            } else {
              result = { error: `unknown tool: ${tc.name}` };
            }
            await this.cache.set(input.sessionId, tc.name, parsed, result);
          } catch (e) {
            result = { error: (e as Error).message };
          }
        }

        const json = JSON.stringify(result);
        emit({
          type: "tool_result",
          name: tc.name,
          preview: json.length > 240 ? json.slice(0, 240) + "…" : json,
        });
        messages.push({
          role: "tool",
          content: json.length > MAX_TOOL_RESULT_BYTES ? json.slice(0, MAX_TOOL_RESULT_BYTES) + "…[truncated]" : json,
          tool_call_id: tc.id,
        });
      }
    }

    throw new Error(`agent did not submit_answer within ${MAX_ITERATIONS} iterations`);
  }
}
