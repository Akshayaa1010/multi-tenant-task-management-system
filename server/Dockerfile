# ─────────────────────────────────────────────
#  Stage 1 — Dependencies
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# ─────────────────────────────────────────────
#  Stage 2 — Development (nodemon hot-reload)
# ─────────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

RUN npm install -g nodemon

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5000

CMD ["nodemon", "server.js"]

# ─────────────────────────────────────────────
#  Stage 3 — Production
#  Build with: docker build --target production .
# ─────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drop root privileges
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

CMD ["node", "server.js"]
