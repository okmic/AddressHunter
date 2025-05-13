FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ /app/src/

# Установка watchdog для автоматического перезапуска
RUN pip install watchdog uvicorn

CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app/src"]