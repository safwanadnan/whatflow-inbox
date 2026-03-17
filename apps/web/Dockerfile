FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY prisma prisma
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install
RUN npx prisma generate

COPY . .
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
