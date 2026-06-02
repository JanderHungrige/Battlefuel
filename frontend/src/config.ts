// Runtime configuration. Overridable via Vite env vars (VITE_*).

export const API_BASE: string =
  import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api/v1'

// WebSocket base for the live sim stream.
// - explicit VITE_WS_BASE wins;
// - absolute http(s) API base → swap scheme to ws(s);
// - relative API base (e.g. "/api/v1", used in prod behind a reverse proxy like NPM) →
//   derive scheme + host from the current page so one build works on any domain/TLS.
function deriveWsBase(api: string): string {
  if (import.meta.env.VITE_WS_BASE) return import.meta.env.VITE_WS_BASE
  if (/^https?:\/\//.test(api)) return api.replace(/^http/, 'ws')
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}${api}`
  }
  return api.replace(/^http/, 'ws')
}

export const WS_BASE: string = deriveWsBase(API_BASE)

// Path (served by Vite from public/) to the offline basemap archive.
export const PMTILES_PATH: string =
  import.meta.env.VITE_PMTILES_PATH ?? '/hohenfels.pmtiles'

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)'
