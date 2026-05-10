import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(sessionId: string): Promise<string> {
    const claims = await this.prisma.claim.findMany({
      where: { sessionId },
      orderBy: [{ turn: "asc" }, { createdAt: "asc" }],
    });
    if (!claims.length) return "";
    return claims
      .map((c) => {
        const cites = (c.citations as unknown as { file: string; startLine: number; endLine: number }[])
          .map((x) => `${x.file}:${x.startLine}-${x.endLine}`)
          .join(", ");
        return `[turn ${c.turn}] ${c.text}  (${cites})`;
      })
      .join("\n");
  }
}
