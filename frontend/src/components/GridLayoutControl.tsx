import { GRID_PRECISIONS } from '../map/mgrsGrid'

interface Props {
  precisionM: number
  onPrecision: (precisionM: number) => void
}

/** On-map control for the MGRS grid precision (drawn square size).
 *
 * The hex-grid layout option is archived (the rendering code is retained in MapView via the
 * `GridLayout` type + `applyGridLayout`, but is no longer exposed in the UI). */
export function GridLayoutControl({ precisionM, onPrecision }: Props) {
  return (
    <div className="grid-control" data-testid="grid-control">
      <span className="grid-control-label">MGRS</span>
      <select
        aria-label="MGRS grid precision"
        value={precisionM}
        onChange={(e) => onPrecision(Number(e.target.value))}
      >
        {GRID_PRECISIONS.map((p) => (
          <option key={p.m} value={p.m}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  )
}
