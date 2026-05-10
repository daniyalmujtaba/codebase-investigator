export interface Citation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface Claim {
  text: string;
  citations: Citation[];
}

export interface AgentAnswer {
  answerMarkdown: string;
  claims: Claim[];
  assumptions: string[];
  openQuestions: string[];
}

export type VerifierStatus = "pass" | "warn" | "fail";

export interface CitationCheck {
  citation: Citation;
  status: VerifierStatus;
  reason?: string;
  snippet?: string;
}

export interface VerifierReport {
  status: VerifierStatus;
  checks: CitationCheck[];
}

export interface AuditorVerdict {
  unsupportedClaims: { claim: string; reason: string }[];
  contradictions: { claim: string; conflictsWith: string; turn: number }[];
  counterQuestion: string | null;
  overallVerdict: "trust" | "caution" | "reject";
  notes: string;
}

export interface AuditReport {
  verifier: VerifierReport;
  auditor: AuditorVerdict;
}

export type SseEvent =
  | { type: "token"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; preview: string }
  | { type: "answer"; answer: AgentAnswer }
  | { type: "audit"; audit: AuditReport }
  | { type: "error"; message: string }
  | { type: "done" };
