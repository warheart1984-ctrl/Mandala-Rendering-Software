# Render: set Root Directory / Docker context to mrs/apps/genblaze-media
# Dockerfile Path (from repo root): mrs/apps/genblaze-media/Dockerfile
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

# System deps kept minimal; genblaze/boto3 are pure wheels on slim
COPY requirements-docker.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements-docker.txt

COPY app ./app

RUN mkdir -p /app/data \
 && useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Render injects PORT; bind all interfaces
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
