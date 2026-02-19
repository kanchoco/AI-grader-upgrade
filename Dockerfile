FROM node:18 AS frontend

WORKDIR /frontend

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build


FROM python:3.10

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ai_grader.py ./
COPY --from=frontend /frontend/dist ./dist

ENV PORT=8080

CMD ["gunicorn", "-b", ":8080", "app:app"]

