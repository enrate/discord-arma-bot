FROM python:3.11-slim

WORKDIR /app

# Устанавливаем зависимости для работы с FTP
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем Python зависимости
RUN pip install -U \
    discord.py \
    ftputil

COPY main.py .

CMD ["python", "main.py"]