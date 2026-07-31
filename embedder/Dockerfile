ARG PYTHON_VERSION=3.12

FROM python:$PYTHON_VERSION-slim
WORKDIR /opt/app

COPY requirements.txt .
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
        -r requirements.txt

COPY app.py .

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

ARG DOCKER_REPO
ARG BUILD_DATE
ARG SOURCE_COMMIT
LABEL \
    org.opencontainers.image.title="${DOCKER_REPO}" \
    org.opencontainers.image.url="https://github.com/rr-/szurubooru" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.source="https://github.com/rr-/szurubooru" \
    org.opencontainers.image.revision="${SOURCE_COMMIT}" \
    org.opencontainers.image.licenses="GPL-3.0"
