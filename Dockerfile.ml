FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ src/
EXPOSE 8001
CMD ["uvicorn", "src.ml.intent_classifier.inference:app", "--host", "0.0.0.0", "--port", "8001"]
