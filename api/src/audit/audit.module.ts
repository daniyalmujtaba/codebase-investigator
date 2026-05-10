import { Module } from "@nestjs/common";
import { VerifierService } from "./verifier.service";
import { AuditorService } from "./auditor.service";
import { AgentModule } from "../agent/agent.module";

@Module({
  imports: [AgentModule],
  providers: [VerifierService, AuditorService],
  exports: [VerifierService, AuditorService],
})
export class AuditModule {}
