"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/lib/api";

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
    <main style={{ maxWidth: 720, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Codebase Investigator</h1>
      <p className="subtle" style={{ marginBottom: 24 }}>
        Paste a public GitHub URL. Ask questions in plain English. Every answer ships with an
        independent audit.
      </p>
      <form onSubmit={start} className="card" style={{ display: "flex", gap: 12, flexDirection: "column" }}>
        <input
          type="text"
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="subtle">Cloned shallowly into a local cache.</span>
          <button className="btn" disabled={busy || !url.trim()}>
            {busy ? "Cloning…" : "Investigate"}
          </button>
        </div>
        {err && <div className="badge fail" style={{ alignSelf: "flex-start" }}>{err}</div>}
      </form>
    </main>
  );
}
