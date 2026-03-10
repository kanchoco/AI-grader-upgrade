FROM node:22 AS frontend

WORKDIR /app

COPY frontend/package*.json ./
RUN npm install

COPY frontend .
RUN npm run build


FROM python:3.10

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app.py backend/ai_grader.py ./

# frontend 빌드 결과 복사
COPY --from=frontend /app/dist ./dist

ENV PORT=8080

CMD ["gunicorn", "-b", ":8080", "backend.app:app"]