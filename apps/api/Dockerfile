FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install

COPY . .
RUN npm run build --workspace @whatflow/api

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["npm", "run", "start"]
