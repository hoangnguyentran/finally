# FinAlly — single container, single port (8000).
# Stage 1 builds the Next.js static export; stage 2 runs FastAPI, which serves
# both /api/* and the exported frontend as static files.

# ---------------------------------------------------------------------------
# Stage 1: build the frontend static export (Next.js `output: 'export'` -> out/)
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend-build

WORKDIR /build

# Copy manifests first so dependency install is cached independently of source.
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Python runtime — FastAPI + uv
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# uv is distributed as a static binary in its own image; no curl/install script needed.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    DATABASE_PATH=/app/db/finally.db \
    STATIC_DIR=/app/static

WORKDIR /app

# Dependency layer: resolve/install deps without the project source so edits to
# app/ don't invalidate the (slow) dependency install.
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --no-dev --no-install-project

# Application source.
COPY backend/app ./app
RUN uv sync --no-dev

# Frontend static export, served by FastAPI from STATIC_DIR.
COPY --from=frontend-build /build/out ./static

# Volume mount point for the SQLite file (see docker-compose.yml / start scripts).
RUN mkdir -p /app/db

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
