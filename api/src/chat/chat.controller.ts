import { Body, Controller, HttpException, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { z } from "zod";
import type { SseEvent } from "@ci/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AgentService } from "../agent/agent.service";
import { VerifierService } from "../audit/verifier.service";
import { AuditorService } from "../audit/auditor.service";
import { LedgerService } from "./ledger.service";

const ChatDto = z.object({
  sessionId: z.string(),
  message: z.string().min(1),
});

@Controller("chat")
export class ChatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agent: AgentService,
    private readonly verifier: VerifierService,
    private readonly auditor: AuditorService,
    private readonly ledger: LedgerService,
  ) {}

  @Throttle({ chat: { ttl: 60_000, limit: 10 } })
  @Post("stream")
  async stream(@Body() body: unknown, @Res() res: Response) {
    const { sessionId, message } = ChatDto.parse(body);
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { repo: true, messages: { orderBy: { turn: "asc" } } },
    });
    if (!session) throw new HttpException("session not found", 404);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (e: SseEvent) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };

    try {
      const turn = (session.messages.at(-1)?.turn ?? 0) + 1;
      const userMsg = await this.prisma.message.create({
        data: { sessionId, turn, role: "user", content: message },
      });
      const assistantMsg = await this.prisma.message.create({
        data: { sessionId, turn: turn + 1, role: "assistant", content: "" },
      });

      const history = session.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      const ledgerSummary = await this.ledger.summary(sessionId);

      const answer = await this.agent.run(
        {
          repoId: session.repo.id,
          repoRoot: session.repo.cachePath,
          history,
          userMessage: message,
          ledgerSummary,
          skeleton: session.repo.skeleton ?? null,
          sessionId,
          messageId: assistantMsg.id,
        },
        send,
      );

      const verifierReport = await this.verifier.verify(session.repo.cachePath, answer);
      const auditResult = await this.auditor.audit({
        question: message,
        answer,
        verifier: verifierReport,
        ledgerSummary,
        sessionId,
        messageId: assistantMsg.id,
      });

      await this.prisma.message.update({
        where: { id: assistantMsg.id },
        data: { content: answer.answerMarkdown, rawAnswer: answer as unknown as object },
      });

      const acceptedClaims = answer.claims.filter((c, i) => {
        const checksForClaim = verifierReport.checks.filter((k) =>
          c.citations.some(
            (ci) =>
              ci.file === k.citation.file &&
              ci.startLine === k.citation.startLine &&
              ci.endLine === k.citation.endLine,
          ),
        );
        return checksForClaim.length === 0 || checksForClaim.every((k) => k.status !== "fail");
      });

      for (const c of acceptedClaims) {
        await this.prisma.claim.create({
          data: {
            sessionId,
            messageId: assistantMsg.id,
            turn: assistantMsg.turn,
            text: c.text,
            citations: c.citations as unknown as object,
          },
        });
      }

      await this.prisma.audit.create({
        data: {
          messageId: assistantMsg.id,
          verifier: verifierReport as unknown as object,
          auditor: auditResult.verdict as unknown as object,
          auditorModel: auditResult.model,
          promptTokens: auditResult.promptTokens,
          outputTokens: auditResult.outputTokens,
        },
      });

      send({ type: "audit", audit: { verifier: verifierReport, auditor: auditResult.verdict } });
      send({ type: "done" });
      res.end();
    } catch (e) {
      send({ type: "error", message: (e as Error).message });
      send({ type: "done" });
      res.end();
    }
  }
}
