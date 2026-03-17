FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS prisma-client

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/whatflow?schema=public
RUN npx prisma generate

FROM prisma-client AS builder

COPY . .
RUN npm run build --workspace @whatflow/api
RUN npm run build --workspace @whatflow/web

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/package-lock.json* ./
COPY --from=deps /app/apps/api/package.json apps/api/package.json
COPY --from=deps /app/apps/web/package.json apps/web/package.json
COPY --from=deps /app/node_modules node_modules
COPY --from=builder /app/dist dist
COPY --from=builder /app/apps/web/dist apps/web/dist
COPY --from=builder /app/prisma prisma
COPY --from=builder /app/prisma.config.ts prisma.config.ts

EXPOSE 3001
CMD ["npm", "run", "start", "--workspace", "@whatflow/api"]
