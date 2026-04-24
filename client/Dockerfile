# ─────────────────────────────────────────────
#  Stage 1 — Dependencies
# ─────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Install dependencies first (layer cache friendly)
COPY package.json package-lock.json* ./
RUN npm ci

# ─────────────────────────────────────────────
#  Stage 2 — Development server
# ─────────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

# Vite dev server — bind to 0.0.0.0 so Docker can expose the port
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# ─────────────────────────────────────────────
#  Stage 3 — Production build  (optional target)
#  Build with: docker build --target production .
# ─────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
