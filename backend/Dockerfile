# Production image for the BattleFuel FastAPI backend.
# Multi-stage: build a venv with the project + runtime deps, then copy it into a slim,
# non-root runtime. Build context is `backend/`.
#
# Base images are pinned to major.minor + distro for reproducibility; pin to a full digest
# once a registry is in the deploy loop (see docs/37 known_issues / Wave-7 Open Research).

# ---- build stage -------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS build

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1

# Build a self-contained venv we can copy wholesale into the runtime stage.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /src
# Project metadata + sources, then install (installs runtime deps from [project] + the app
# package; dev extras are intentionally excluded from the production image).
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install .

# ---- runtime stage -----------------------------------------------------------------------
FROM python:3.12-slim-bookworm

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Non-root runtime user (global rule: never run the app as root).
RUN groupadd --system app && useradd --system --gid app --no-create-home app

COPY --from=build /opt/venv /opt/venv

WORKDIR /app
# App is installed in the venv; we still ship the source + migration/seed scripts so
# `alembic upgrade head` and the seed scripts run inside this image during bootstrap.
COPY app ./app
COPY scripts ./scripts
COPY alembic ./alembic
COPY alembic.ini ./

USER app
EXPOSE 8000

# Liveness against the real API health route (no extra packages — stdlib only).
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status==200 else 1)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
