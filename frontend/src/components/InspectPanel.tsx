// Side panel showing details of the selected tile or unit instance.

import type {
  MoveOrderStatus,
  SectorSituation,
  Tile,
  TileMutationRequest,
  UnitInstance,
  UnitType,
} from '../api/types'
import type { CellSituation } from '../map/cellSituation'

const SITUATIONS: SectorSituation[] = [
  'quiet',
  'enemy_contact',
  'under_fire',
  'combat',
  'secured',
  'supply_point',
  'medevac',
]

export interface LiveUnitState {
  fuel_l: number
  progress_m: number
  distance_m: number
  status: MoveOrderStatus
}

/** The clicked MGRS cell: its coordinate, aggregated situation, underlying tiles + units in it. */
export interface InspectCell {
  mgrs: string
  situation: CellSituation
  h3Indexes: string[]
  units: { id: string; name: string }[]
}

interface InspectPanelProps {
  cell?: InspectCell
  unit?: UnitInstance
  unitType?: UnitType
  live?: LiveUnitState
  /** Apply a mutation to every tile in the cell (cell-wide sector edit). */
  onMutateCell?: (h3Indexes: string[], mutation: TileMutationRequest) => void
  onClose: () => void
}

function CellEdit({
  cell,
  onMutate,
}: {
  cell: InspectCell
  onMutate: (h3Indexes: string[], mutation: TileMutationRequest) => void
}) {
  const h3 = cell.h3Indexes
  return (
    <div className="tile-edit" data-testid="tile-edit">
      <h3>Edit cell</h3>
      <div className="inspect-row">
        <span className="inspect-label">Threat</span>
        <span className="tile-edit-threat">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`threat-btn${cell.situation.maxThreat === n ? ' active' : ''}`}
              data-testid={`set-threat-${n}`}
              onClick={() => onMutate(h3, { threat_level: n })}
            >
              {n}
            </button>
          ))}
        </span>
      </div>
      <label className="inspect-row">
        <span className="inspect-label">Road</span>
        <select
          value={cell.situation.worstRoad}
          data-testid="set-road"
          onChange={(e) =>
            onMutate(h3, { road_condition: e.target.value as Tile['road_condition'] })
          }
        >
          <option value="clear">clear</option>
          <option value="damaged">damaged</option>
          <option value="blocked">blocked</option>
        </select>
      </label>
      <label className="inspect-row">
        <span className="inspect-label">Situation</span>
        <select
          defaultValue=""
          data-testid="set-situation"
          onChange={(e) =>
            e.target.value && onMutate(h3, { situation: e.target.value as SectorSituation })
          }
        >
          <option value="">—</option>
          {SITUATIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <form
        className="tile-edit-note"
        onSubmit={(e) => {
          e.preventDefault()
          const input = e.currentTarget.elements.namedItem('note') as HTMLInputElement
          onMutate(h3, { note: input.value })
        }}
      >
        <input
          name="note"
          type="text"
          maxLength={280}
          placeholder="Add note…"
          data-testid="set-note-input"
        />
        <button type="submit" data-testid="set-note-submit">
          Save
        </button>
      </form>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inspect-row">
      <span className="inspect-label">{label}</span>
      <span className="inspect-value">{value}</span>
    </div>
  )
}

export function InspectPanel({
  cell,
  unit,
  unitType,
  live,
  onMutateCell,
  onClose,
}: InspectPanelProps) {
  if (!cell && !unit) return null

  return (
    <aside className="inspect" data-testid="inspect-panel">
      <button className="inspect-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      {cell && (
        <>
          <h2>MGRS Cell</h2>
          <Row label="Coordinate" value={cell.mgrs} />
          <Row label="Threat" value={`${cell.situation.maxThreat} / 5`} />
          <Row label="Terrain" value={cell.situation.dominantTerrain} />
          <Row label="Road" value={cell.situation.worstRoad} />
          <Row label="Intel" value={cell.situation.maxIntel} />
          <Row label="Tiles" value={cell.situation.count} />
          {cell.units.length > 0 && (
            <Row label="Units" value={cell.units.map((u) => u.name).join(', ')} />
          )}
          {onMutateCell && cell.h3Indexes.length > 0 && (
            <CellEdit cell={cell} onMutate={onMutateCell} />
          )}
        </>
      )}

      {unit && (
        <>
          <h2>{unit.name}</h2>
          <Row label="Type" value={unitType?.name ?? unit.unit_type_id} />
          <Row label="Status" value={unit.status} />
          {unit.current_fuel_liters === null ? (
            <div className="inspect-warning" data-testid="no-telemetry">
              No telemetry received.
              <button className="inspect-action">Request manual update</button>
            </div>
          ) : (
            <Row label="Fuel" value={`${unit.current_fuel_liters.toLocaleString()} L`} />
          )}
          {unitType && (
            <>
              <Row label="Fuel type" value={unitType.fuel.fuel_type} />
              <Row label="Capacity" value={`${unitType.fuel.capacity_liters.toLocaleString()} L`} />
              <Row
                label="Endurance (normal)"
                value={
                  unitType.endurance_hours_normal !== null
                    ? `${unitType.endurance_hours_normal} h`
                    : '—'
                }
              />
            </>
          )}
          {live && (
            <div className="inspect-live" data-testid="inspect-live">
              <h3>Live</h3>
              <Row label="Live fuel" value={`${Math.round(live.fuel_l).toLocaleString()} L`} />
              <Row
                label="Progress"
                value={`${Math.round(live.progress_m).toLocaleString()} / ${Math.round(
                  live.distance_m,
                ).toLocaleString()} m`}
              />
              <Row label="Order" value={live.status} />
            </div>
          )}
        </>
      )}
    </aside>
  )
}
