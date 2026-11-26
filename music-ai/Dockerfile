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
COPY scripts/check_env.py scripts/check_env.py
# Model Transcoda không đóng vào image: tải lần đầu vào volume cache.
ENV HF_HOME=/cache/huggingface \
    STORAGE_ROOT=/data/storage
EXPOSE 8000
# Kiểm tra môi trường trong container: docker exec <container> python scripts/check_env.py
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=4)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
