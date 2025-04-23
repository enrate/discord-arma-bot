FROM python:3.11-slim

WORKDIR /app

RUN pip install discord.py python-a2s

COPY main.py .

CMD ["python", "main.py"]