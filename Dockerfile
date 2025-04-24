# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Установка Python и зависимостей для сборки
RUN apk add --no-cache python3 py3-pip

# 1. Копируем файлы зависимостей
COPY package.json package-lock.json ./

# 2. Устанавливаем зависимости
RUN npm ci --include=dev

# 3. Копируем исходный код
COPY tsconfig.json ./
COPY src/ ./src/

# 4. Собираем проект
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# 5. Копируем только production зависимости
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
COPY .env /app/.env
RUN npm ci --omit=dev

# 6. Копируем собранный код
COPY --from=builder /app/dist/ ./dist/

# 7. Настройки для production
ENV NODE_ENV=production

# 8. Точка монтирования для данных
VOLUME /app/data

# 9. Запуск приложения
CMD ["node", "dist/index.js"]