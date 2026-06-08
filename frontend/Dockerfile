# Production image for the BattleFuel React/MapLibre frontend.
# Multi-stage: build the Vite bundle (with the offline basemap baked in), then serve the
# static output with nginx. The API/WS base URLs are injected at BUILD time as build args
# (the same image is domain-specific; rebuild per environment — see Wave-7 Open Research on
# build-time vs runtime injection).
#
# IMPORTANT: build context is the REPO ROOT (not frontend/), because the prebuild
# `sync:assets` step copies data/hohenfels.pmtiles into public/ — it resolves ../../data
# relative to frontend/scripts/. Build with:
#   docker build -f frontend/Dockerfile -t battlefuel-frontend \
#     --build-arg VITE_API_BASE=https://example.com/api/v1 \
#     --build-arg VITE_WS_BASE=wss://example.com/api/v1 .

# ---- build stage -------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app/frontend
# Install deps first for layer caching.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Frontend sources + the committed offline basemap (sync:assets reads ../../data).
COPY frontend ./
COPY data/hohenfels.pmtiles /app/data/hohenfels.pmtiles
# Branding logos + official PDFs — sync:assets copies these into public/logos and public/docs.
# They resolve at the repo root (/app); without them the build silently ships no logos/docs.
COPY ["company Logos", "/app/company Logos"]
COPY ["Official logistic documents", "/app/Official logistic documents"]

# Same-origin defaults are wrong for prod; inject the real domain at build time.
ARG VITE_API_BASE
ARG VITE_WS_BASE
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_WS_BASE=$VITE_WS_BASE
RUN npm run build

# ---- runtime stage -----------------------------------------------------------------------
FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
    CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:80/"]
