FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ripgrep ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm install --workspaces --include-workspace-root --omit=dev=false

FROM deps AS build
COPY shared shared
COPY api api
RUN npm --workspace api run prisma:generate
RUN npm --workspace api run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/api/dist /app/api/dist
COPY --from=build /app/api/package.json /app/api/package.json
COPY --from=build /app/api/prisma /app/api/prisma
COPY --from=build /app/shared /app/shared
COPY --from=build /app/package.json /app/package.json
EXPOSE 4000
WORKDIR /app/api
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/api/src/main.js"]
