"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getSession, streamChat } from "@/lib/api";
import type { AuditReport, SseEvent } from "@ci/shared";

interface Turn {
  role: "user" | "assistant";
  content: string;
  audit?: AuditReport;
  toolEvents: { name: string; preview?: string; args?: unknown }[];
}

export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [meta, setMeta] = useState<{ repo?: { url: string; owner: string; name: string }; title?: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSession(sessionId).then((s) => {
      setMeta({ repo: s.repo, title: s.title });
      const restored: Turn[] = s.messages.map((m: { role: "user" | "assistant"; content: string; audit?: { verifier: AuditReport["verifier"]; auditor: AuditReport["auditor"] } }) => ({
        role: m.role,
        content: m.content,
        audit: m.audit ? { verifier: m.audit.verifier, auditor: m.audit.auditor } : undefined,
        toolEvents: [],
      }));
      setTurns(restored);
    });
  }, [sessionId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns]);

  async function send() {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput("");
    setStreaming(true);
    setTurns((t) => [
      ...t,
      { role: "user", content: msg, toolEvents: [] },
      { role: "assistant", content: "", toolEvents: [] },
    ]);
    try {
      await streamChat(sessionId, msg, (ev: SseEvent) => {
        setTurns((t) => {
          const next = [...t];
          const last = next[next.length - 1];
          if (last.role !== "assistant") return next;
          if (ev.type === "tool_call") last.toolEvents.push({ name: ev.name, args: ev.args });
          else if (ev.type === "tool_result") last.toolEvents.push({ name: ev.name, preview: ev.preview });
          else if (ev.type === "answer") last.content = ev.answer.answerMarkdown;
          else if (ev.type === "audit") last.audit = ev.audit;
          else if (ev.type === "error") last.content = `**Error:** ${ev.message}`;
          return next;
        });
      });
    } catch (e) {
      setTurns((t) => {
        const next = [...t];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") last.content = `**Error:** ${(e as Error).message}`;
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: "100vh", gap: 0 }}>
      <section style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #23262f" }}>
        <header style={{ padding: "12px 18px", borderBottom: "1px solid #23262f" }}>
          <div style={{ fontWeight: 600 }}>{meta?.title ?? "Session"}</div>
          {meta?.repo && (
            <a className="subtle" href={meta.repo.url} target="_blank" rel="noreferrer">
              {meta.repo.owner}/{meta.repo.name}
            </a>
          )}
        </header>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {turns.map((t, i) => (
            <div key={i} className="card" style={{ borderColor: t.role === "user" ? "#1f6feb44" : "#23262f" }}>
              <div className="subtle" style={{ marginBottom: 6 }}>{t.role === "user" ? "You" : "Investigator"}</div>
              {t.role === "assistant" && t.toolEvents.length > 0 && !t.content && (
                <div className="subtle" style={{ marginBottom: 8 }}>
                  Investigating… {t.toolEvents.length} tool calls
                </div>
              )}
              {t.role === "assistant" && t.toolEvents.length > 0 && (
                <details style={{ marginBottom: 8 }}>
                  <summary className="subtle">Trace ({t.toolEvents.length})</summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                    {t.toolEvents.map((ev, j) => (
                      <div key={j} className="codeblock">
                        <strong>{ev.name}</strong>
                        {ev.args ? `  ${JSON.stringify(ev.args)}` : ""}
                        {ev.preview ? `\n→ ${ev.preview}` : ""}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <div style={{ lineHeight: 1.55 }}>
                <ReactMarkdown>{t.content || (t.role === "assistant" && streaming ? "_thinking…_" : "")}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
        <footer style={{ borderTop: "1px solid #23262f", padding: 12, display: "flex", gap: 8 }}>
          <textarea
            rows={2}
            placeholder="Ask about the codebase…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <button className="btn" onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? "…" : "Send"}
          </button>
        </footer>
      </section>

      <aside style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ margin: 0 }}>Audit</h3>
        {(() => {
          const last = [...turns].reverse().find((t) => t.role === "assistant" && t.audit);
          if (!last?.audit) return <div className="subtle">No audit yet — ask a question.</div>;
          const v = last.audit.verifier;
          const a = last.audit.auditor;
          return (
            <>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>Citation verifier</strong>
                  <span className={`badge ${v.status}`}>{v.status}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {v.checks.map((c, i) => (
                    <div key={i} className="codeblock">
                      <span className={`badge ${c.status}`}>{c.status}</span>{" "}
                      {c.citation.file}:{c.citation.startLine}-{c.citation.endLine}
                      {c.reason ? `\n${c.reason}` : ""}
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong>Auditor LLM</strong>
                  <span className={`badge ${a.overallVerdict}`}>{a.overallVerdict}</span>
                </div>
                {a.notes && <div style={{ fontSize: 13, marginBottom: 8 }}>{a.notes}</div>}
                {a.unsupportedClaims.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div className="subtle">Unsupported</div>
                    {a.unsupportedClaims.map((u, i) => (
                      <div key={i} className="codeblock">{u.claim}\n→ {u.reason}</div>
                    ))}
                  </div>
                )}
                {a.contradictions.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div className="subtle">Contradictions</div>
                    {a.contradictions.map((c, i) => (
                      <div key={i} className="codeblock">turn {c.turn}: {c.conflictsWith}\nnow: {c.claim}</div>
                    ))}
                  </div>
                )}
                {a.counterQuestion && (
                  <div>
                    <div className="subtle">Counter-question</div>
                    <div className="codeblock">{a.counterQuestion}</div>
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </aside>
    </main>
  );
}
