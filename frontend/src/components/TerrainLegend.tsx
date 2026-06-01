import { TERRAIN_COLORS } from '../map/overlays'

export function TerrainLegend() {
  return (
    <div className="legend" data-testid="legend">
      {Object.entries(TERRAIN_COLORS).map(([terrain, color]) => (
        <span key={terrain} className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {terrain}
        </span>
      ))}
    </div>
  )
}
