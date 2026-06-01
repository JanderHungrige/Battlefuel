// OF-8 supply panel (Wave 5 of8-supply-ui): fuel distribution + buy / refuel order placement.

import { useMemo, useState } from 'react'
import type { FuelDepot, RefuelOrder, SupplyOverview } from '../api/types'

export interface RecommendationView {
  order: RefuelOrder
  truckName: string
}

export interface SupplyPanelProps {
  overview: SupplyOverview | null
  depots: FuelDepot[]
  refuelTargets: { id: string; name: string }[]
  recommendation: RecommendationView | null
  busy?: boolean
  message?: string | null
  onBuy: (depotId: string, fuelType: string, quantityLiters: number) => void
  onRefuel: (unitId: string) => void
  onConfirmRefuel: () => void
  onCancelRefuel: () => void
}

const fmt = (n: number): string => Math.round(n).toLocaleString()

export function SupplyPanel({
  overview,
  depots,
  refuelTargets,
  recommendation,
  busy = false,
  message = null,
  onBuy,
  onRefuel,
  onConfirmRefuel,
  onCancelRefuel,
}: SupplyPanelProps) {
  const [buyDepot, setBuyDepot] = useState(depots[0]?.id ?? '')
  const [buyQty, setBuyQty] = useState(5000)
  const [refuelUnit, setRefuelUnit] = useState(refuelTargets[0]?.id ?? '')

  // Fuel types offered for the chosen depot = the fuel types it already stocks.
  const fuelOptions = useMemo(() => {
    const d = overview?.depots.find((x) => x.depot.id === buyDepot)
    return d ? d.stocks.map((s) => s.fuel_type) : []
  }, [overview, buyDepot])
  const [buyFuel, setBuyFuel] = useState(fuelOptions[0] ?? '')
  const effectiveFuel = fuelOptions.includes(buyFuel) ? buyFuel : (fuelOptions[0] ?? '')

  return (
    <aside className="supply-panel" data-testid="supply-panel">
      <h2>Joint-Force Supply</h2>

      <section className="supply-dist">
        {overview?.depots.map((d) => (
          <div key={d.depot.id} className="depot-row">
            <div className="depot-name">{d.depot.name}</div>
            {d.stocks.map((s) => {
              const pct = s.capacity_liters > 0 ? (s.quantity_liters / s.capacity_liters) * 100 : 0
              return (
                <div key={s.fuel_type} className="stock-row">
                  <span className="stock-label">{s.fuel_type}</span>
                  <span className="stock-bar">
                    <span className="stock-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="stock-val">
                    {fmt(s.quantity_liters)} / {fmt(s.capacity_liters)} L
                  </span>
                </div>
              )
            })}
          </div>
        ))}
        <div className="trucks">
          <div className="depot-name">Fuel trucks</div>
          {overview?.trucks.map((t) => (
            <div key={t.instance_id} className="truck-row">
              <span>{t.name}</span>
              <span className="stock-val">
                {t.current_fuel_liters == null
                  ? 'no telemetry'
                  : `${fmt(t.current_fuel_liters)} / ${fmt(t.capacity_liters)} L ${t.fuel_type}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="supply-form">
        <h3>Buy fuel → depot</h3>
        <select
          data-testid="buy-depot"
          value={buyDepot}
          onChange={(e) => setBuyDepot(e.target.value)}
        >
          {depots.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          data-testid="buy-fuel"
          value={effectiveFuel}
          onChange={(e) => setBuyFuel(e.target.value)}
        >
          {fuelOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          data-testid="buy-quantity"
          type="number"
          min={1}
          value={buyQty}
          onChange={(e) => setBuyQty(Number(e.target.value))}
        />
        <button
          type="button"
          data-testid="buy-submit"
          disabled={busy || !buyDepot || !effectiveFuel || buyQty <= 0}
          onClick={() => onBuy(buyDepot, effectiveFuel, buyQty)}
        >
          Buy fuel
        </button>
      </section>

      <section className="supply-form">
        <h3>Refuel a unit</h3>
        <select
          data-testid="refuel-unit"
          value={refuelUnit}
          onChange={(e) => setRefuelUnit(e.target.value)}
        >
          {refuelTargets.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="refuel-submit"
          disabled={busy || !refuelUnit}
          onClick={() => onRefuel(refuelUnit)}
        >
          Request refuel
        </button>

        {recommendation && (
          <div className="recommendation" data-testid="refuel-recommendation">
            <p>
              Recommended truck: <strong>{recommendation.truckName}</strong>. Move it to the
              rendezvous (OF-4 move order); fuel transfers when they meet.
            </p>
            <div className="rec-actions">
              <button type="button" data-testid="refuel-confirm" onClick={onConfirmRefuel}>
                Confirm
              </button>
              <button type="button" className="ghost" onClick={onCancelRefuel}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {message && <div className="supply-msg">{message}</div>}
    </aside>
  )
}
