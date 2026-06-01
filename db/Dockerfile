# PostgreSQL 16 + PostGIS 3.4 + pgRouting + osm2pgrouting for BattleFuel.
# Extends the official PostGIS image (Debian, PGDG repo configured) with pgRouting (so the
# routing graph can CREATE EXTENSION pgrouting) and the osm2pgrouting CLI (run inside the
# container to build the ways/vertices topology). PG major / PostGIS versions are unchanged,
# so the existing data volume stays compatible.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgrouting osm2pgrouting \
    && rm -rf /var/lib/apt/lists/*
