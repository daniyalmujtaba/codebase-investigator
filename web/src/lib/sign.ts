import { createHmac } from "crypto";

const SECRET = process.env.AUTH_SHARED_SECRET ?? "";

export function signEmail(email: string): { ts: string; token: string } {
  if (!SECRET) throw new Error("AUTH_SHARED_SECRET not set");
  const ts = Math.floor(Date.now() / 1000).toString();
  const token = createHmac("sha256", SECRET).update(`${email}|${ts}`).digest("hex");
  return { ts, token };
}
