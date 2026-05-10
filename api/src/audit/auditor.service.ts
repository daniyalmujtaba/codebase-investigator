import { Injectable, Logger } from "@nestjs/common";
import type { AgentAnswer, AuditorVerdict, VerifierReport } from "@ci/shared";
import { LlmService } from "../llm/llm.service";

const AUDITOR_SYSTEM = `You are an INDEPENDENT auditor reviewing another agent's answer about a code repository.

You do NOT see the agent's reasoning or tool calls. You see only:
- the user question
- the agent's final answer markdown
- each claim with its cited file/lines AND the actual snippet that was read
- a programmatic verifier report (already checked: file exists, range valid, token overlap)
- a compressed ledger of claims the agent committed to in earlier turns

Your job:
1. For each claim, decide if the cited snippet actually supports the claim. List unsupported claims.
2. Flag any claim that contradicts an earlier ledger entry. Reference the earlier turn number.
3. Propose ONE sharp counter-question that would expose a weakness if the answer is wrong.
4. Give an overall verdict: "trust" | "caution" | "reject".

Be terse. Do not restate the answer. Do not give general advice. Only call your judgement.`;

const AUDITOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    unsupportedClaims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { claim: { type: "string" }, reason: { type: "string" } },
        required: ["claim", "reason"],
      },
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          conflictsWith: { type: "string" },
          turn: { type: "integer" },
        },
        required: ["claim", "conflictsWith", "turn"],
      },
    },
    counterQuestion: { type: ["string", "null"] },
    overallVerdict: { type: "string", enum: ["trust", "caution", "reject"] },
    notes: { type: "string" },
  },
  required: ["unsupportedClaims", "contradictions", "counterQuestion", "overallVerdict", "notes"],
};

@Injectable()
export class AuditorService {
  private readonly log = new Logger(AuditorService.name);
  constructor(private readonly llm: LlmService) {}

  async audit(input: {
    question: string;
    answer: AgentAnswer;
    verifier: VerifierReport;
    ledgerSummary: string;
    sessionId: string;
    messageId: string;
  }): Promise<{ verdict: AuditorVerdict; model: string; promptTokens: number; outputTokens: number }> {
    const claimsWithSnippets = input.answer.claims.map((claim) => ({
      claim: claim.text,
      citations: claim.citations.map((c) => {
        const check = input.verifier.checks.find(
          (k) => k.citation.file === c.file && k.citation.startLine === c.startLine && k.citation.endLine === c.endLine,
        );
        return {
          file: c.file,
          range: `${c.startLine}-${c.endLine}`,
          verifier: check?.status ?? "unknown",
          snippet: check?.snippet ?? null,
        };
      }),
    }));

    const userPayload = JSON.stringify(
      {
        question: input.question,
        answerMarkdown: input.answer.answerMarkdown,
        claimsWithSnippets,
        verifierStatus: input.verifier.status,
        priorClaimsLedger: input.ledgerSummary || "(empty — first turn)",
      },
      null,
      2,
    );

    const model = await this.llm.auditorModel();
    const res = await this.llm.call(
      "auditor",
      model,
      {
        // Fresh context — no prior history, no agent reasoning.
        messages: [
          { role: "system", content: AUDITOR_SYSTEM },
          { role: "user", content: userPayload },
        ],
        responseFormat: { type: "json_schema", name: "AuditorVerdict", schema: AUDITOR_SCHEMA },
        temperature: 0,
      },
      { sessionId: input.sessionId, messageId: input.messageId },
    );

    let verdict: AuditorVerdict;
    try {
      verdict = JSON.parse(res.content || "{}");
    } catch {
      verdict = {
        unsupportedClaims: [],
        contradictions: [],
        counterQuestion: null,
        overallVerdict: "caution",
        notes: "auditor returned non-JSON output",
      };
    }
    return {
      verdict,
      model: `${model.providerId}:${model.model}`,
      promptTokens: res.promptTokens,
      outputTokens: res.outputTokens,
    };
  }
}
