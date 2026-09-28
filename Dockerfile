# ── Dependencies ──
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ── Dev stage ──
FROM deps AS dev

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

COPY web/ .
COPY contracts/proto ./proto

CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

# ── Build stage ──
FROM deps AS builder

COPY web/ .
COPY contracts/proto ./proto

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# ── Run stage ──
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/proto ./proto

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
