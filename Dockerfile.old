FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN pip install -U \
    discord.py \
    ftputil

COPY main.py .

VOLUME /app/data  # Для сохранения ID сообщения

CMD ["python", "main.py"]