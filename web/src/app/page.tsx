"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, AlertCircle, Github, ShieldCheck, Brain, Search } from "lucide-react";

const EXAMPLES = [
  "https://github.com/honojs/hono",
  "https://github.com/colinhacks/zod",
  "https://github.com/vercel/swr",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { session } = await createSession(url.trim());
      router.push(`/s/${session.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid-bg relative min-h-screen">
      <header className="px-6 py-5 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 flex items-center justify-center">
            <span className="text-[var(--color-accent)] font-mono text-xs font-bold">CI</span>
          </div>
          <span className="text-sm font-medium tracking-tight">Codebase Investigator</span>
        </div>
      </header>

      <section className="max-w-2xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-1 text-[11px] uppercase tracking-wider text-[var(--color-fg-muted)] mb-6">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          Audited answers
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight bg-gradient-to-b from-white to-[#9aa3b6] bg-clip-text text-transparent">
          Investigate any codebase
        </h1>
        <p className="mt-4 text-[var(--color-fg-muted)] text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
          Paste a public GitHub URL. Ask questions in plain English. Every non-trivial answer ships with an independent audit and citations you can verify.
        </p>

        <form
          onSubmit={start}
          className="mt-10 mx-auto max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-md p-2 flex items-center gap-2 shadow-2xl shadow-black/40 focus-within:border-[var(--color-accent)]/50 transition-colors"
        >
          <div className="pl-3 text-[var(--color-fg-subtle)]">
            <Github className="h-4 w-4" />
          </div>
          <Input
            type="text"
            placeholder="github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            className="flex-1 border-0 bg-transparent focus:ring-0 focus:border-0 h-11 text-[15px]"
          />
          <Button type="submit" disabled={busy || !url.trim()} className="h-10">
            {busy ? "Cloning…" : "Investigate"}
            {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        {err && (
          <div className="mt-4 mx-auto max-w-xl flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-left text-sm text-rose-300">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="text-[var(--color-fg-subtle)]">Try:</span>
          {EXAMPLES.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUrl(u)}
              className="font-mono text-[11.5px] text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] bg-[var(--color-surface)]/60 px-2.5 py-1 rounded-full transition-colors"
            >
              {u.replace("https://github.com/", "")}
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24 grid sm:grid-cols-3 gap-4">
        {[
          { icon: Search, title: "Targeted reads", body: "Semantic file selection plus on-demand grep — only the relevant code, no full-repo dumps." },
          { icon: Brain, title: "Multi-turn coherence", body: "Claims ledger keeps the agent honest across pushback over many turns." },
          { icon: ShieldCheck, title: "Independent audit", body: "A fresh-context auditor and programmatic citation checker review every answer." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
            <div className="h-8 w-8 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center mb-3">
              <Icon className="h-4 w-4 text-[var(--color-accent)]" />
            </div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-[var(--color-fg-muted)] mt-1.5 leading-relaxed">{body}</div>
          </div>
        ))}
      </section>
    </main>
  );
}
