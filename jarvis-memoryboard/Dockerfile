FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    JARVIS_HOST=0.0.0.0 \
    JARVIS_STORE_PATH=/var/data/jarvis-store.json \
    JARVIS_EMR_DYNAMICS_PATH=/var/data/emr-dynamics.json \
    JARVIS_AMUL_PATH=/var/data/amul-field.jsonl \
    JARVIS_MEMORY_WRITE_ENABLED=false

ENV JARVIS_PROTECT_LEDGER_READ=false

COPY pyproject.toml ./
COPY app ./app
COPY mcp_server ./mcp_server

RUN pip install --no-cache-dir .

EXPOSE 8001

# Render injects PORT; default 8001 for local docker run.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
