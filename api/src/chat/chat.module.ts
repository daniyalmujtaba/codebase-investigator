import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { LedgerService } from "./ledger.service";
import { AgentModule } from "../agent/agent.module";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AgentModule, AuditModule],
  controllers: [ChatController],
  providers: [LedgerService],
})
export class ChatModule {}
