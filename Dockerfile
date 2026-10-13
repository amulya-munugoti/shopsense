FROM python:3.12-slim

WORKDIR /app
COPY analytics_api/requirements.txt ./analytics_api/requirements.txt
RUN pip install --no-cache-dir -r analytics_api/requirements.txt
COPY analytics_api ./analytics_api
COPY dataset ./dataset
COPY server/uploads/products ./server/uploads/products
RUN mkdir -p /app/server/db /app/server/uploads

ENV HOST=0.0.0.0
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "python -m uvicorn analytics_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
