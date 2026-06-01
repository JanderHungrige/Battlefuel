// Per-unit overview (Wave 5 unit-overview-telemetry): stats for every placed unit, with a
// "request manual update" affordance for units that have no fuel telemetry.

import { useState } from 'react'
import type { UnitInstance, UnitType } from '../api/types'

function UnitRow({
  unit,
  typeName,
  echelon,
  capacity,
  onSetTelemetry,
}: {
  unit: UnitInstance
  typeName: string
  echelon: string
  capacity: number
  onSetTelemetry: (id: string, liters: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const noData = unit.current_fuel_liters == null

  return (
    <div className="unit-row" data-testid={`unit-row-${unit.id}`}>
      <div className="unit-head">
        <span className="unit-name">{unit.name}</span>
        <span className="unit-meta">
          {typeName} · {echelon} · {unit.status}
        </span>
      </div>
      <div className="unit-fuel">
        {noData ? (
          <span className="no-data">no data</span>
        ) : (
          <span>
            {Math.round(unit.current_fuel_liters as number).toLocaleString()} /{' '}
            {Math.round(capacity).toLocaleString()} L
          </span>
        )}
        {noData && !editing && (
          <button
            type="button"
            data-testid="telemetry-request"
            className="telemetry-btn"
            onClick={() => setEditing(true)}
          >
            request manual update
          </button>
        )}
        {noData && editing && (
          <span className="telemetry-form">
            <input
              type="number"
              min={0}
              data-testid="telemetry-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="litres"
            />
            <button
              type="button"
              data-testid="telemetry-submit"
              disabled={value === '' || Number(value) < 0}
              onClick={() => {
                onSetTelemetry(unit.id, Number(value))
                setEditing(false)
              }}
            >
              Set
            </button>
          </span>
        )}
      </div>
    </div>
  )
}

export function UnitOverview({
  units,
  unitTypes,
  onSetTelemetry,
  onClose,
}: {
  units: UnitInstance[]
  unitTypes: UnitType[]
  onSetTelemetry: (id: string, liters: number) => void
  onClose: () => void
}) {
  return (
    <aside className="unit-overview" data-testid="unit-overview">
      <header className="unit-overview-head">
        <h2>Unit Overview</h2>
        <button type="button" className="ghost" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      {units.map((u) => {
        const t = unitTypes.find((ut) => ut.id === u.unit_type_id)
        return (
          <UnitRow
            key={u.id}
            unit={u}
            typeName={t?.name ?? u.unit_type_id}
            echelon={t?.echelon ?? '—'}
            capacity={t?.fuel.capacity_liters ?? 0}
            onSetTelemetry={onSetTelemetry}
          />
        )
      })}
    </aside>
  )
}
