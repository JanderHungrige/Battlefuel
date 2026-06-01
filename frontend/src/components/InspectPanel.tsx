// Side panel showing details of the selected tile or unit instance.

import type {
  MoveOrderStatus,
  Tile,
  TileMutationRequest,
  UnitInstance,
  UnitType,
} from '../api/types'

export interface LiveUnitState {
  fuel_l: number
  progress_m: number
  distance_m: number
  status: MoveOrderStatus
}

interface InspectPanelProps {
  tile?: Tile
  unit?: UnitInstance
  unitType?: UnitType
  live?: LiveUnitState
  onMutateTile?: (h3Index: string, mutation: TileMutationRequest) => void
  onClose: () => void
}

function TileEdit({
  tile,
  onMutate,
}: {
  tile: Tile
  onMutate: (h3Index: string, mutation: TileMutationRequest) => void
}) {
  return (
    <div className="tile-edit" data-testid="tile-edit">
      <h3>Edit sector</h3>
      <div className="inspect-row">
        <span className="inspect-label">Threat</span>
        <span className="tile-edit-threat">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`threat-btn${tile.threat_level === n ? ' active' : ''}`}
              data-testid={`set-threat-${n}`}
              onClick={() => onMutate(tile.h3_index, { threat_level: n })}
            >
              {n}
            </button>
          ))}
        </span>
      </div>
      <label className="inspect-row">
        <span className="inspect-label">Road</span>
        <select
          value={tile.road_condition}
          data-testid="set-road"
          onChange={(e) =>
            onMutate(tile.h3_index, { road_condition: e.target.value as Tile['road_condition'] })
          }
        >
          <option value="clear">clear</option>
          <option value="damaged">damaged</option>
          <option value="blocked">blocked</option>
        </select>
      </label>
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
  tile,
  unit,
  unitType,
  live,
  onMutateTile,
  onClose,
}: InspectPanelProps) {
  if (!tile && !unit) return null

  return (
    <aside className="inspect" data-testid="inspect-panel">
      <button className="inspect-close" onClick={onClose} aria-label="Close">
        ×
      </button>

      {tile && (
        <>
          <h2>Tile</h2>
          <Row label="Terrain" value={tile.terrain} />
          <Row label="Threat" value={`${tile.threat_level} / 5`} />
          <Row label="Intel" value={tile.intel_level} />
          <Row label="Weather" value={tile.weather} />
          <Row label="Road" value={tile.road_condition} />
          <Row label="Cover" value={tile.cover} />
          <Row label="H3" value={tile.h3_index} />
          {onMutateTile && <TileEdit tile={tile} onMutate={onMutateTile} />}
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
