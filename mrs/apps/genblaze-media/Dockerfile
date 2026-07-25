# Render: set Root Directory / Docker context to mrs/apps/genblaze-media
# Dockerfile Path (from repo root): mrs/apps/genblaze-media/Dockerfile
#
# NVIDIA FLUX stills only. This context cannot reach
# mrs/packages/renderer-core, so the RT4D backend reports
# rt4d.available=false here. Build the repo-root Dockerfile (repo-root context)
# for a deploy that bundles Node + renderer-core.
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    GENBLAZE_HTTP_TIMEOUT=600 \
    GENBLAZE_NVCF_TIMEOUT=600 \
    GENBLAZE_PIPELINE_TIMEOUT=720 \
    GENBLAZE_NVCF_POLL_SECONDS=300 \
    GENBLAZE_CONNECT_TIMEOUT=30

# System deps kept minimal; genblaze/boto3 are pure wheels on slim
# genblaze-core 0.3.7 declares pillow<12; overlay Pillow 12.3.0 for CVE fixes
COPY requirements-docker.txt .
RUN pip install --upgrade pip \
 && pip install -r requirements-docker.txt \
 && pip install --no-deps Pillow==12.3.0

COPY app ./app

RUN mkdir -p /app/data \
 && useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Render injects PORT; bind all interfaces
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
