// Builds a MapLibre style for the offline PMTiles basemap.
//
// Pure function (no browser globals) so it is unit-testable. Text/label layers are
// omitted on purpose — labels need a glyphs endpoint, which would break offline use.

import type { StyleSpecification } from 'maplibre-gl'
import { OSM_ATTRIBUTION } from '../config'

/**
 * @param pmtilesArchiveUrl absolute URL to the .pmtiles archive (e.g. http://host/hohenfels.pmtiles)
 */
export function buildBasemapStyle(pmtilesArchiveUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${pmtilesArchiveUrl}`,
        attribution: OSM_ATTRIBUTION,
      },
    },
    // Classic, light cartographic palette (parchment base, soft natural fills, dark roads for
    // contrast). Tunable here. Still no symbol/glyph layers — labels need a glyphs endpoint that
    // would break offline use.
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#eadbc8' },
      },
      {
        id: 'areas',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'areas',
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'natural'], 'water'],
            '#a9cce3',
            ['any', ['==', ['get', 'natural'], 'wood'], ['==', ['get', 'landuse'], 'forest']],
            '#c6d9b0',
            ['!=', ['get', 'building'], null],
            '#ddd5c7',
            '#ebe6db',
          ],
          'fill-opacity': 0.85,
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        paint: {
          'line-color': '#8a8270',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 13, 1.2, 16, 2.5],
        },
      },
    ],
  }
}
