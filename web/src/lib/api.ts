import type { SseEvent } from "@ci/shared";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

async function authHeaders(): Promise<Record<string, string>> {
  const r = await fetch("/api/me", { credentials: "include" });
  if (!r.ok) return {};
  const { email, ts, token } = await r.json();
  if (!email) return {};
  return { "X-User-Email": email, "X-User-Ts": ts, "X-User-Token": token };
}

export async function createSession(repoUrl: string, title?: string) {
  const r = await fetch(`${API}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ repoUrl, title }),
  });
  if (!r.ok) throw new Error(`createSession failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getSession(id: string) {
  const r = await fetch(`${API}/sessions/${id}`, { headers: await authHeaders() });
  if (!r.ok) throw new Error(`getSession failed: ${r.status}`);
  return r.json();
}

export async function streamChat(
  sessionId: string,
  message: string,
  onEvent: (e: SseEvent) => void,
  signal?: AbortSignal,
) {
  const r = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ sessionId, message }),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`stream failed: ${r.status} ${await r.text()}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            onEvent(JSON.parse(line.slice(6)) as SseEvent);
          } catch { /* ignore */ }
        }
      }
    }
  }
}
