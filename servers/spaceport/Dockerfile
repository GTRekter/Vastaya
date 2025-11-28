# Container image for ghcr.io/vastaya/spaceport:latest
#
# Build with:
#   docker build -f servers/universe_builder/Dockerfile -t ghcr.io/vastaya/spaceport:latest .
#
# Run locally:
#   docker run --rm -p 8080:8080 ghcr.io/vastaya/spaceport:latest

FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
ENV PYTHONPATH=/app \
    PORT=8080

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
