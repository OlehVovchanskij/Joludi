FROM python:3.10-slim-buster

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN sed -i \
    -e 's|http://deb.debian.org/debian|http://archive.debian.org/debian|g' \
    -e 's|http://deb.debian.org/debian-security|http://archive.debian.org/debian-security|g' \
    /etc/apt/sources.list \
    && printf 'Acquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99archive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . /app

RUN pip install --no-cache-dir -r requirements.txt

# Compile the high-performance C math extension (haversine, integration, ENU).
RUN python native/setup.py build_ext --inplace || echo "C extension build skipped"

EXPOSE 8501

CMD ["sh", "-c", "if [ -f alembic.ini ]; then alembic upgrade head; else echo 'alembic.ini not found, skipping migrations'; fi && uvicorn app:app --host 0.0.0.0 --port 8501"]