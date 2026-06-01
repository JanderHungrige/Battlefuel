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
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': '#0e1116' },
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
            '#15324f',
            ['any', ['==', ['get', 'natural'], 'wood'], ['==', ['get', 'landuse'], 'forest']],
            '#18351f',
            ['!=', ['get', 'building'], null],
            '#2c3038',
            '#1b2027',
          ],
          'fill-opacity': 0.65,
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        paint: {
          'line-color': '#7d8794',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 13, 1.2, 16, 2.5],
        },
      },
    ],
  }
}
