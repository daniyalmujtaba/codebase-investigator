CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Repo"
  ADD COLUMN "skeleton"   TEXT,
  ADD COLUMN "skeletonAt" TIMESTAMP(3);

CREATE TABLE "FileSummary" (
  "id"        TEXT NOT NULL,
  "repoId"    TEXT NOT NULL,
  "path"      TEXT NOT NULL,
  "summary"   TEXT NOT NULL,
  "embedding" vector(768),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileSummary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FileSummary_repoId_path_key" ON "FileSummary"("repoId", "path");
CREATE INDEX "FileSummary_repoId_idx" ON "FileSummary"("repoId");
ALTER TABLE "FileSummary"
  ADD CONSTRAINT "FileSummary_repoId_fkey"
  FOREIGN KEY ("repoId") REFERENCES "Repo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "FileSummary_embedding_ivfflat"
  ON "FileSummary" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 50);

CREATE TABLE "Setting" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "InvestigationCache" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "toolName"  TEXT NOT NULL,
  "argsHash"  TEXT NOT NULL,
  "result"    JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestigationCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvestigationCache_sessionId_toolName_argsHash_key"
  ON "InvestigationCache"("sessionId", "toolName", "argsHash");
CREATE INDEX "InvestigationCache_sessionId_idx" ON "InvestigationCache"("sessionId");
