import { Injectable } from "@nestjs/common";
import type { AgentAnswer, CitationCheck, VerifierReport } from "@ci/shared";
import { ToolsService } from "../agent/tools.service";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being","of","in","on","to",
  "for","with","that","this","it","its","as","at","by","from","into","than","then","so","not",
  "we","you","they","i","do","does","did","can","could","should","would","may","might","will",
  "have","has","had","what","which","who","when","where","why","how","there","also",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  );
}

@Injectable()
export class VerifierService {
  constructor(private readonly tools: ToolsService) {}

  async verify(repoRoot: string, answer: AgentAnswer): Promise<VerifierReport> {
    const checks: CitationCheck[] = [];
    for (const claim of answer.claims) {
      const claimTokens = tokenize(claim.text);
      for (const c of claim.citations) {
        try {
          if (!c.file || c.startLine < 1 || c.endLine < c.startLine) {
            checks.push({ citation: c, status: "fail", reason: "invalid line range" });
            continue;
          }
          const slice = await this.tools.readFile(repoRoot, c.file, c.startLine, c.endLine);
          if ((slice.endLine ?? 0) < c.endLine && c.endLine > slice.total) {
            checks.push({
              citation: c,
              status: "fail",
              reason: `endLine ${c.endLine} exceeds file length ${slice.total}`,
              snippet: slice.content.slice(0, 240),
            });
            continue;
          }
          const snippetTokens = tokenize(slice.content);
          let overlap = 0;
          for (const t of claimTokens) if (snippetTokens.has(t)) overlap++;
          const status = overlap === 0 && claimTokens.size > 2 ? "warn" : "pass";
          checks.push({
            citation: c,
            status,
            reason: status === "warn" ? "no token overlap between claim and snippet" : undefined,
            snippet: slice.content,
          });
        } catch (e) {
          checks.push({ citation: c, status: "fail", reason: (e as Error).message });
        }
      }
    }
    const overall: VerifierReport["status"] = checks.some((c) => c.status === "fail")
      ? "fail"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "pass";
    return { status: overall, checks };
  }
}
