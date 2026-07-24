# Render default: Dockerfile Path ./Dockerfile, Root Directory empty (repo root).
# Builds the Genblaze media hackathon app from mrs/apps/genblaze-media.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

COPY mrs/apps/genblaze-media/requirements-docker.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements-docker.txt

COPY mrs/apps/genblaze-media/app ./app

RUN mkdir -p /app/data \
 && useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
