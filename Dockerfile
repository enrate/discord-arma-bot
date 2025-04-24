# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Сначала копируем только файлы зависимостей
COPY package.json package-lock.json ./
RUN npm ci

# Затем копируем остальные файлы
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Создаем директорию для данных и устанавливаем права
RUN mkdir -p /app/data && chown -R node:node /app/data

COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/dist/ ./dist/
COPY --chown=node:node .env ./

USER node

VOLUME /app/data

CMD ["node", "dist/index.js"]