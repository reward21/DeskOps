FROM python:3.11-slim
WORKDIR /app
COPY services/fastapi/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY services/fastapi ./services/fastapi
WORKDIR /app/services/fastapi
EXPOSE 8090
ENV FASTAPI_PORT=8090
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8090"]
