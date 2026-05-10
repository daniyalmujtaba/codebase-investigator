import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { LlmModule } from "./llm/llm.module";
import { ReposModule } from "./repos/repos.module";
import { SessionsModule } from "./sessions/sessions.module";
import { ChatModule } from "./chat/chat.module";
import { SettingsModule } from "./settings/settings.module";
import { EmbeddingsModule } from "./embeddings/embeddings.module";
import { CommonModule } from "./common/common.module";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env"] }),
    ThrottlerModule.forRoot([
      { name: "global", ttl: 60_000, limit: 60 },
      { name: "chat",   ttl: 60_000, limit: 10 },
    ]),
    PrismaModule,
    AuthModule,
    SettingsModule,
    LlmModule,
    EmbeddingsModule,
    ReposModule,
    SessionsModule,
    ChatModule,
    CommonModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
