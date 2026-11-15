FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Mạng chậm hoặc chập chờn: chờ lâu hơn và thử lại nhiều lần khi tải gói lớn như PyTorch.
ENV PIP_DEFAULT_TIMEOUT=300 PIP_RETRIES=10
COPY requirements.txt .
# PyTorch bản CPU (nhỏ hơn nhiều bản CUDA); các gói còn lại theo requirements.txt.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY app app
# Model Transcoda không đóng vào image: tải lần đầu vào volume cache.
ENV HF_HOME=/cache/huggingface \
    STORAGE_ROOT=/data/storage
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
