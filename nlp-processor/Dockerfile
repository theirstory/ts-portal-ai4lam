# Dockerfile for NLP Processor Service
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Disable Python output buffering for real-time logs
ENV PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install CPU-only torch first. The default PyPI wheel drags in ~2.5GB of NVIDIA
# CUDA packages that this service never uses (USE_GPU=false, and it is deployed to
# CPU-only hosts). Pulling it from the PyTorch CPU index keeps the image small.
# If this ever runs on a GPU host, drop this line so requirements.txt resolves the
# CUDA build from PyPI instead.
RUN pip install --no-cache-dir --timeout 180 --retries 10 \
    --index-url https://download.pytorch.org/whl/cpu torch

# Install the rest (torch above already satisfies the torch requirement)
RUN pip install --no-cache-dir --timeout 180 --retries 10 -r requirements.txt

# Copy application code
COPY . .

# Create cache directory for HuggingFace models
RUN mkdir -p /root/.cache/huggingface

# Expose the port
EXPOSE 7070

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:7070/health || exit 1

# Run the application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7070"]
