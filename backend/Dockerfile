FROM python:3.11-slim

# System libs needed by PyMuPDF / reportlab / Pillow etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl libjpeg-dev zlib1g-dev libfreetype6-dev \
      libmupdf-dev mupdf-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install python deps first for better layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

# Where uploads land on disk (mounted from the host via docker-compose)
RUN mkdir -p /app/uploads/local/tmp /app/uploads/local/submissions

EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
