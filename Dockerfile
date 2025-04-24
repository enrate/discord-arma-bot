# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Сначала копируем только файлы зависимостей
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Затем копируем остальные файлы
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Копируем ВСЕ зависимости (включая dotenv)
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/dist/ ./dist/
COPY .env ./

VOLUME /app/data

CMD ["node", "dist/index.js"]