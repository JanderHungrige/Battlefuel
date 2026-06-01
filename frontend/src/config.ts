// Runtime configuration. Overridable via Vite env vars (VITE_*).

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1'

// Path (served by Vite from public/) to the offline basemap archive.
export const PMTILES_PATH: string =
  import.meta.env.VITE_PMTILES_PATH ?? '/hohenfels.pmtiles'

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'
