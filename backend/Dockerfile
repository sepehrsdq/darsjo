FROM python:3.12-slim

ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=60

# No apt-get here on purpose: the server cannot reliably reach deb.debian.org.
# psycopg[binary] ships its own libpq, so no system packages are required.
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 5 -r requirements.txt

COPY . .

RUN useradd --system --uid 1500 --home /app darsjo \
    && mkdir -p /data/media /app/staticfiles \
    && chown -R darsjo:darsjo /app /data
USER darsjo

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "-b", "127.0.0.1:8000", "-w", "3", "-t", "90"]
