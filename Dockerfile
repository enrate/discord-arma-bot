# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Установка Python и зависимостей для сборки
RUN apk add --no-cache \
    build-base \
    python3 \
    pkgconfig \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    musl-dev \
    git

# Устанавливаем глобальные npm-пакеты
RUN npm install -g npm@11.3.0

# 1. Копируем файлы зависимостей
COPY package.json package-lock.json ./

# 2. Устанавливаем зависимости
RUN npm ci --include=dev

# 3. Копируем исходный код
COPY tsconfig.json ./
COPY src/ ./src/

# 4. Собираем проект
RUN npm run build

# Удаляем dev-зависимости после сборки
RUN npm prune --production

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Устанавливаем runtime зависимости для canvas
RUN apk add --no-cache \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg

# 5. Копируем production зависимости из builder
COPY --from=builder /app/node_modules ./node_modules

# 6. Копируем собранный код и настройки
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/package*.json ./
COPY .env ./

# 7. Настройки для production
ENV NODE_ENV=production

# 8. Точка монтирования для данных
VOLUME /app/data

# 9. Запуск приложения
CMD ["node", "dist/index.js"]