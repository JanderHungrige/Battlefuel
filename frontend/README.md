# BattleFuel — Frontend

React + TypeScript + Vite client. Renders the offline Hohenfels basemap (MapLibre GL +
PMTiles), a hex grid styled by terrain, placed units as APP-6 symbols (`milsymbol`), and a
click-to-inspect panel.

## Requirements

- Node ≥ 20 (developed on 23)
- The running backend (see `../backend/README.md`) and a built basemap
  (`../data/hohenfels.pmtiles`, produced by `backend/scripts/build_basemap.sh`).

## Setup & run

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (copies the basemap into public/ first)
```

The backend must be running at `http://localhost:8000` (override with `VITE_API_BASE`).
CORS for `localhost:5173` is enabled in the backend.

```bash
# typical full-stack dev, from the repo root:
docker compose up -d db
( cd backend && source .venv/bin/activate && uvicorn app.main:app --reload )
( cd frontend && npm run dev )
```

## Scripts

```bash
npm run dev       # dev server (runs sync:assets first)
npm run build     # tsc -b + vite build (runs sync:assets first)
npm run preview   # serve the production build
npm test          # vitest
npm run lint      # eslint
```

## Layout

```
frontend/
├── src/
│   ├── config.ts            # API base, PMTiles path, attribution
│   ├── api/{types,client}.ts# typed schemas + fetch wrapper
│   ├── map/
│   │   ├── basemapStyle.ts  # MapLibre style over the PMTiles source
│   │   ├── MapView.tsx      # map + overlays + click-to-inspect
│   │   ├── overlays.ts      # tiles/units → GeoJSON, terrain colours
│   │   └── symbols.ts       # SIDC → icon via milsymbol
│   ├── components/InspectPanel.tsx
│   └── App.tsx              # data load + selection state + shell
└── scripts/sync-assets.mjs  # copies ../data/hohenfels.pmtiles → public/
```

## Notes

- The basemap is offline (single PMTiles file); map labels are omitted to avoid needing a
  glyphs server.
- Map data © OpenStreetMap contributors (ODbL).
