// Side panel showing details of the selected tile or unit instance.

import type { Tile, UnitInstance, UnitType } from '../api/types'

interface InspectPanelProps {
  tile?: Tile
  unit?: UnitInstance
  unitType?: UnitType
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inspect-row">
      <span className="inspect-label">{label}</span>
      <span className="inspect-value">{value}</span>
    </div>
  )
}

export function InspectPanel({ tile, unit, unitType, onClose }: InspectPanelProps) {
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
        </>
      )}
    </aside>
  )
}
