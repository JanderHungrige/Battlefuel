import type { GridLayout } from '../map/MapView'
import { GRID_PRECISIONS } from '../map/mgrsGrid'

interface Props {
  layout: GridLayout
  precisionM: number
  onLayout: (layout: GridLayout) => void
  onPrecision: (precisionM: number) => void
}

/** On-map control: switch between the MGRS coordinate grid and the H3 hex grid, and (in MGRS
 * mode) pick the drawn square precision. */
export function GridLayoutControl({ layout, precisionM, onLayout, onPrecision }: Props) {
  return (
    <div className="grid-control" data-testid="grid-control">
      <div className="grid-control-toggle">
        <button
          type="button"
          className={layout === 'mgrs' ? 'active' : ''}
          onClick={() => onLayout('mgrs')}
        >
          MGRS
        </button>
        <button
          type="button"
          className={layout === 'hex' ? 'active' : ''}
          onClick={() => onLayout('hex')}
        >
          Hex
        </button>
      </div>
      {layout === 'mgrs' && (
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
      )}
    </div>
  )
}
