# Container image for the Universe configuration API
#
# Build locally:
#   docker build -t vastaya-universe:local ./servers/universe
# Run locally:
#   docker run --rm -p 4005:4005 vastaya-universe:local

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

ENV PORT=4005

EXPOSE 4005
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4005"]
