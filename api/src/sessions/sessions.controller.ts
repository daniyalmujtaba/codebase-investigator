import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { ReposService } from "../repos/repos.service";

const CreateSessionDto = z.object({
  repoUrl: z.string().url(),
  title: z.string().optional(),
});

@Controller("sessions")
export class SessionsController {
  constructor(private readonly prisma: PrismaService, private readonly repos: ReposService) {}

  @Post()
  async create(@Body() body: unknown) {
    const { repoUrl, title } = CreateSessionDto.parse(body);
    const repo = await this.repos.ensure(repoUrl);
    const session = await this.prisma.session.create({
      data: { repoId: repo.id, title: title ?? `${repo.owner}/${repo.name}` },
    });
    return { session, repo };
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        repo: true,
        messages: {
          orderBy: { turn: "asc" },
          include: { audit: true },
        },
      },
    });
    if (!session) throw new Error("session not found");
    return session;
  }
}
