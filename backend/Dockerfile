# Imagen del backend (API y worker comparten imagen; solo cambia el comando). Contexto de construcción = RAÍZ del repo,
# porque el único lockfile es el raíz (nunca `npm install` dentro de backend/). Uso:
#   docker build -f backend/Dockerfile -t save-a-life-backend .
#   docker run ... save-a-life-backend                    # API: node dist/server.js
#   docker run ... save-a-life-backend node dist/worker.js # worker del outbox
# Sin secretos: todo llega por variables de entorno (ver docs/Deploy-Runbook.md). Node y npm fijados como en .nvmrc y CI.

FROM node:24.19.0-slim AS base
ENV SCARF_ANALYTICS=false NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
# `engines` exige npm 12; el npm que trae Node 24 es anterior.
RUN npm install -g npm@12.0.2
WORKDIR /app
# Los manifiestos de todos los workspaces: `npm ci` valida el lockfile contra ellos.
COPY package.json package-lock.json ./
COPY apps/mock-api/package.json apps/mock-api/
COPY apps/web/package.json apps/web/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

FROM base AS build
RUN npm ci --workspace backend
COPY tsconfig.base.json ./
COPY backend/tsconfig.json backend/tsconfig.build.json backend/
COPY backend/src backend/src
RUN npm run build --workspace backend

FROM base AS prod-deps
RUN npm ci --omit=dev --workspace backend

FROM node:24.19.0-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
WORKDIR /app/backend
# La imagen oficial trae el usuario `node` (uid 1000): el proceso no corre como root.
USER node
EXPOSE 3000
# /health/live no depende de la base ni del borde (el guard de X-Edge-Secret lo exime). PORT lo fija la plataforma.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/server.js"]
