# Container image for the Control Tower chat gateway
#
# Build locally:
#   docker build -t vastaya-control-tower:local ./servers/control-tower
# Run locally:
#   docker run --rm -p 3100:3100 vastaya-control-tower:local

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=3100

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

EXPOSE 3100

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "3100"]
