# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# next build needs SOME value for JWT_SECRET at build time; it's only
# used at runtime, so this placeholder is safe.
ENV NEXT_TELEMETRY_DISABLED=1
ENV JWT_SECRET=build_placeholder

RUN npm run build && cp "Wyzly support - Q&A.md" knowledge.md

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Knowledge base seed file
COPY --from=builder /app/knowledge.md ./knowledge.md

# better-sqlite3 is a native module excluded from the standalone bundle;
# copy the prebuilt binaries from the builder stage.
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
