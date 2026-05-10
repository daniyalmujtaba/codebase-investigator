"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getSession, streamChat } from "@/lib/api";
import type { AuditReport, SseEvent } from "@ci/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Github, Send, ChevronDown, Wrench, ShieldCheck,
  AlertTriangle, Sparkles, MessageSquare, Loader2,
} from "lucide-react";

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
  const [openTrace, setOpenTrace] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
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

  const lastAudit = [...turns].reverse().find((t) => t.role === "assistant" && t.audit)?.audit;

  return (
    <main className="grid grid-cols-1 lg:grid-cols-[1fr_380px] h-screen overflow-hidden bg-[var(--color-bg)]">
      <section className="flex flex-col border-r border-[var(--color-border)] min-h-0">
        <header className="px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
              <Github className="h-4 w-4 text-[var(--color-fg-muted)]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{meta?.title ?? "Session"}</div>
              {meta?.repo && (
                <a
                  href={meta.repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-accent)] font-mono truncate block"
                >
                  {meta.repo.owner}/{meta.repo.name}
                </a>
              )}
            </div>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-5">
            {turns.length === 0 && (
              <div className="text-center py-20 text-[var(--color-fg-muted)]">
                <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Ask anything about this repo to begin.</p>
              </div>
            )}
            {turns.map((t, i) => (
              <Turn
                key={i}
                turn={t}
                index={i}
                streaming={streaming && i === turns.length - 1}
                openTrace={!!openTrace[i]}
                onToggleTrace={() => setOpenTrace((s) => ({ ...s, [i]: !s[i] }))}
              />
            ))}
          </div>
        </div>

        <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur-md p-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <Textarea
              ref={taRef}
              rows={1}
              placeholder="Ask about the codebase…   ⌘↵ to send"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
              }}
              className="min-h-[44px] max-h-40"
            />
            <Button onClick={send} disabled={streaming || !input.trim()} size="lg" className="h-11 shrink-0">
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </footer>
      </section>

      <aside className="hidden lg:flex flex-col bg-[var(--color-surface)]/40 min-h-0">
        <header className="px-5 py-3 border-b border-[var(--color-border)] flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--color-accent)]" />
          <span className="text-sm font-medium">Audit</span>
        </header>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">
          {!lastAudit ? (
            <div className="text-center py-12 text-[var(--color-fg-subtle)] text-sm">
              No audit yet — ask a question.
            </div>
          ) : (
            <AuditPanel audit={lastAudit} />
          )}
        </div>
      </aside>
    </main>
  );
}

function Turn({
  turn,
  index,
  streaming,
  openTrace,
  onToggleTrace,
}: {
  turn: Turn;
  index: number;
  streaming: boolean;
  openTrace: boolean;
  onToggleTrace: () => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/8 px-4 py-2.5 text-sm text-[var(--color-fg)]">
          {turn.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[var(--color-fg-muted)] text-xs">
        <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        <span className="font-medium">Investigator</span>
      </div>

      {turn.toolEvents.length > 0 && (
        <button
          type="button"
          onClick={onToggleTrace}
          className="self-start inline-flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
        >
          <Wrench className="h-3 w-3" />
          {turn.toolEvents.length} tool {turn.toolEvents.length === 1 ? "call" : "calls"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", openTrace && "rotate-180")} />
        </button>
      )}

      {openTrace && turn.toolEvents.length > 0 && (
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-2 flex flex-col gap-1">
          {turn.toolEvents.map((ev, j) => (
            <div key={j} className="font-mono text-[11.5px] text-[var(--color-fg-muted)] leading-relaxed px-2 py-1">
              <span className="text-[var(--color-accent)]">{ev.name}</span>
              {ev.args ? <span className="text-[var(--color-fg-subtle)]"> {JSON.stringify(ev.args)}</span> : null}
              {ev.preview ? <div className="text-[var(--color-fg-subtle)] truncate">→ {ev.preview}</div> : null}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl rounded-tl-sm border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-4 py-3">
        {turn.content ? (
          <div className="markdown">
            <ReactMarkdown>{turn.content}</ReactMarkdown>
          </div>
        ) : streaming ? (
          <div className="text-sm text-[var(--color-fg-muted)] italic">
            <span className="blink">Investigating</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AuditPanel({ audit }: { audit: AuditReport }) {
  const v = audit.verifier;
  const a = audit.auditor;
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Citation verifier</div>
          <Badge tone={v.status as "pass" | "warn" | "fail"}>{v.status}</Badge>
        </div>
        <div className="flex flex-col gap-1.5">
          {v.checks.map((c, i) => (
            <div key={i} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-2 text-[11.5px] font-mono">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--color-fg-muted)] truncate">
                  {c.citation.file}<span className="text-[var(--color-fg-subtle)]">:{c.citation.startLine}-{c.citation.endLine}</span>
                </span>
                <Badge tone={c.status as "pass" | "warn" | "fail"} className="shrink-0">{c.status}</Badge>
              </div>
              {c.reason && <div className="text-[var(--color-fg-subtle)] mt-1 leading-relaxed">{c.reason}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-muted)]">Auditor LLM</div>
          <Badge tone={a.overallVerdict as "trust" | "caution" | "reject"}>{a.overallVerdict}</Badge>
        </div>
        {a.notes && <p className="text-[13px] text-[var(--color-fg)] leading-relaxed mb-3">{a.notes}</p>}

        {a.unsupportedClaims.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] mb-1.5">
              <AlertTriangle className="h-3 w-3 text-amber-400" />
              Unsupported claims
            </div>
            <div className="flex flex-col gap-1.5">
              {a.unsupportedClaims.map((u, i) => (
                <div key={i} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11.5px]">
                  <div className="text-[var(--color-fg)]">{u.claim}</div>
                  <div className="text-[var(--color-fg-muted)] mt-1">→ {u.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {a.contradictions.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)] mb-1.5">
              <AlertTriangle className="h-3 w-3 text-rose-400" />
              Contradictions
            </div>
            <div className="flex flex-col gap-1.5">
              {a.contradictions.map((c, i) => (
                <div key={i} className="rounded-md border border-rose-500/20 bg-rose-500/5 p-2 text-[11.5px]">
                  <div className="text-[var(--color-fg-muted)]">turn {c.turn}: {c.conflictsWith}</div>
                  <div className="text-[var(--color-fg)] mt-1">now: {c.claim}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {a.counterQuestion && (
          <div>
            <div className="text-xs text-[var(--color-fg-muted)] mb-1.5">Counter-question</div>
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 p-2 text-[12.5px] italic text-[var(--color-fg)]">
              {a.counterQuestion}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
