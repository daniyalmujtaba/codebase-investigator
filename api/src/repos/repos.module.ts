import { Module } from "@nestjs/common";
import { ReposService } from "./repos.service";
import { SkeletonService } from "./skeleton.service";

@Module({
  providers: [ReposService, SkeletonService],
  exports: [ReposService, SkeletonService],
})
export class ReposModule {}
