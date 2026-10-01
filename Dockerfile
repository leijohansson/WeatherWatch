FROM node:24-slim AS frontend-builder

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_BACKEND_HOST
ENV VITE_BACKEND_HOST=$VITE_BACKEND_HOST
RUN pnpm run build

FROM gdssingapore/airbase:python-3.14
ENV PYTHONUNBUFFERED=TRUE 
ENV PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN python3 -m pip install uv
RUN uv sync --frozen --no-cache

USER app

COPY --chown=app:app . /app
COPY --chown=app:app --from=frontend-builder /app/dist ./dist

EXPOSE 8080

CMD ["/app/.venv/bin/fastapi", "run", "/app/main.py", "--port", "8080", "--host", "0.0.0.0"]
