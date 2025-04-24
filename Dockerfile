# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm ci
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist/ ./dist/
COPY .env ./

RUN npm ci --only=production

VOLUME /app/data

CMD ["node", "dist/index.js"]