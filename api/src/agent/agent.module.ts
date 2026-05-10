import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { ToolsService } from "./tools.service";
import { InvestigationCacheService } from "./cache.service";
import { ReposModule } from "../repos/repos.module";

@Module({
  imports: [ReposModule],
  providers: [AgentService, ToolsService, InvestigationCacheService],
  exports: [AgentService, ToolsService],
})
export class AgentModule {}
