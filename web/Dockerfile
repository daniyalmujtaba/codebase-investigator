FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY web/package.json web/
COPY api/package.json api/
RUN npm install --workspaces --include-workspace-root

FROM deps AS build
COPY shared shared
COPY web web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm --workspace web run build

FROM base AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/web /app/web
COPY --from=build /app/shared /app/shared
COPY --from=build /app/package.json /app/package.json
EXPOSE 3000
WORKDIR /app/web
CMD ["npm", "run", "start"]
