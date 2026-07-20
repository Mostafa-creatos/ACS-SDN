# Stage 1: Build the React frontend
FROM node:20-alpine as frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build the FastAPI backend
FROM python:3.11-slim

WORKDIR /workspace

# Install system dependencies (including postgres client tools, iputils-ping, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    python3-dev \
    libpq-dev \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Copy the built frontend dist folder from Stage 1
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Generate self-signed SSL certs for uvicorn
RUN openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"

# Default command launches FastAPI via uvicorn with SSL keys if they exist
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--ssl-keyfile", "key.pem", "--ssl-certfile", "cert.pem"]
