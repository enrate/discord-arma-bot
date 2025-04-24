FROM python:3.11-slim
WORKDIR /app
RUN pip install -U discord.py python-a2s
COPY main.py .
CMD ["python", "main.py"]