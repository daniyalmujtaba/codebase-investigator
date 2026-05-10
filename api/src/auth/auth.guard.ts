import { CanActivate, ExecutionContext, HttpException, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import type { Request } from "express";

export const PUBLIC_PATH_PREFIXES = ["/healthz", "/admin/"]; // /admin guarded by its own token

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly log = new Logger(AuthGuard.name);
  private readonly allowed: Set<string>;
  private readonly secret: string;
  private readonly enabled: boolean;

  constructor(cfg: ConfigService, _refl: Reflector) {
    this.secret = cfg.get<string>("AUTH_SHARED_SECRET") ?? "";
    this.enabled = !!this.secret;
    this.allowed = new Set(
      (cfg.get<string>("ALLOWED_EMAILS") ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    if (!this.enabled) this.log.warn("AUTH_SHARED_SECRET not set — auth guard disabled (dev only)");
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (PUBLIC_PATH_PREFIXES.some((p) => req.path === p || req.path.startsWith(p))) return true;
    if (!this.enabled) return true;

    const email = String(req.headers["x-user-email"] ?? "").toLowerCase();
    const ts = String(req.headers["x-user-ts"] ?? "");
    const token = String(req.headers["x-user-token"] ?? "");
    if (!email || !ts || !token) throw new HttpException("missing auth headers", 401);

    const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
    if (!Number.isFinite(ageSec) || ageSec > 300) throw new HttpException("auth header expired", 401);

    const expected = createHmac("sha256", this.secret).update(`${email}|${ts}`).digest();
    let provided: Buffer;
    try { provided = Buffer.from(token, "hex"); } catch { throw new HttpException("invalid token", 401); }
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new HttpException("invalid token", 401);
    }
    if (this.allowed.size > 0 && !this.allowed.has(email)) {
      throw new HttpException("forbidden", 403);
    }
    (req as Request & { userEmail?: string }).userEmail = email;
    return true;
  }
}
