# Container image for the Fleet mission API
#
# Build locally:
#   docker build -t vastaya-fleet:local ./servers/fleet
# Run locally:
#   docker run --rm -p 4006:4006 vastaya-fleet:local

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

ENV PORT=4006

EXPOSE 4006
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4006"]
