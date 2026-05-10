# Codebase Investigator

Paste a public GitHub URL, ask questions about the code in plain English, get answers grounded in specific files and line ranges. Every non-trivial answer ships with an independent audit (programmatic citation check + auditor LLM in a fresh context + cross-turn contradiction detection).

## Stack
- **Web:** Next.js (App Router) — chat + audit + citation viewer
- **API:** NestJS — repo ingest, agent loop, auditor, persistence (SSE streaming)
- **DB:** Postgres 16 + Prisma
- **LLM:** OpenAI by default, swappable per-call via `AGENT_MODEL` / `AUDITOR_MODEL` env. Any OpenAI-compatible provider (Moonshot/Kimi, MiniMax, DeepSeek, OpenRouter) works by setting `OPENAI_COMPAT_*`.

## Prerequisites
- Node 20+, Docker, `git`, **ripgrep** (`sudo apt install ripgrep` or `brew install ripgrep`) — the agent's `grep` and `find_files` tools shell out to `rg`.

## Quickstart
```bash
cp .env.example .env  # fill in OPENAI_API_KEY
npm install
npm run db:up
npm run prisma:migrate
npm run dev
```
Web: http://localhost:3000  ·  API: http://localhost:4000

## Cost knobs
- `AGENT_MODEL` — strong tool-use model (default `openai:gpt-5`).
- `AUDITOR_MODEL` — narrower job, cheaper model is fine (default `openai:gpt-5-mini`). Swap to e.g. `openai-compat:kimi-k2-0905-preview` and set `OPENAI_COMPAT_*` env vars.
