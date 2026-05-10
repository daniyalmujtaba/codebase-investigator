import { Module } from "@nestjs/common";
import { SessionsController } from "./sessions.controller";
import { ReposModule } from "../repos/repos.module";

@Module({ imports: [ReposModule], controllers: [SessionsController] })
export class SessionsModule {}
