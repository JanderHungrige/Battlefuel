// OF-8 supply panel (Wave 5 of8-supply-ui): fuel distribution + buy / refuel order placement.

import { useEffect, useMemo, useState } from 'react'
import type { FuelDepot, FuelPlatform, RefuelOrder, SupplyOverview, UnitType } from '../api/types'
import { unitTypeName } from '../lib/callSign'
import { logisticSiteShort } from '../lib/logisticSite'
import { type OrderMeta, OrderFuelMask } from './OrderFuelMask'

// A depot is "low" (eligible for a refuel proposal) when any stock is below half capacity —
// matching the redistribution advisor's 0.5 target fill (v2 Wave 11 F5).
const LOW_FILL = 0.5

export interface RecommendationView {
  order: RefuelOrder
  truckName: string
}

export interface SupplyPanelProps {
  overview: SupplyOverview | null
  depots: FuelDepot[]
  /** Unit-type catalog, to show the unit type behind fleet call signs (v2 W13). */
  unitTypes?: UnitType[]
  refuelTargets: { id: string; name: string }[]
  recommendation: RecommendationView | null
  busy?: boolean
  message?: string | null
  /** Fuel-management platforms for the selector (v2 Wave 11 F2). */
  platforms?: FuelPlatform[]
  selectedPlatformId?: string
  onSelectPlatform?: (id: string) => void
  onAddPlatform?: (name: string) => void
  /** Open the Order History panel (v2 Wave 11 F4). */
  onShowHistory?: () => void
  /** Open the Info Docs panel (v2 Wave 11 F8). */
  onShowDocs?: () => void
  /** Mark + locate a supply entity (depot / fuel truck / …) on the map (v2 Wave 11). */
  onLocate?: (lat: number, lon: number) => void
  /** Start a routed fuel run from a truck (v2 Wave 12): pick a target unit next. */
  onCreateFuelRun?: (truckId: string, truckName: string) => void
  /** Start a rendezvous plan from a truck (v2 Wave 13): pick a unit + a sector next. */
  onPlanRendezvous?: (truckId: string, truckName: string) => void
  /** Notifies the active tab so the map can focus on the relevant units (v2 W13). */
  onTabChange?: (tab: 'overview' | 'fleet' | 'order') => void
  /** Ask the advisor to propose a refuel for a low site (v2 Wave 11 F5). */
  onProposeRefuel?: (depotId: string) => void
  onBuy: (depotId: string, fuelType: string, quantityLiters: number, meta?: OrderMeta) => void
  onRefuel: (unitId: string) => void
  onConfirmRefuel: () => void
  onCancelRefuel: () => void
}

const fmt = (n: number): string => Math.round(n).toLocaleString()

export function SupplyPanel({
  overview,
  depots,
  unitTypes = [],
  refuelTargets,
  recommendation,
  busy = false,
  message = null,
  platforms = [],
  selectedPlatformId = '',
  onSelectPlatform,
  onAddPlatform,
  onShowHistory,
  onShowDocs,
  onLocate,
  onCreateFuelRun,
  onPlanRendezvous,
  onTabChange,
  onProposeRefuel,
  onBuy,
  onRefuel,
  onConfirmRefuel,
  onCancelRefuel,
}: SupplyPanelProps) {
  const [buyDepot, setBuyDepot] = useState(depots[0]?.id ?? '')
  const [buyQty, setBuyQty] = useState(5000)
  const [refuelUnit, setRefuelUnit] = useState(refuelTargets[0]?.id ?? '')
  const [addingPlatform, setAddingPlatform] = useState(false)
  const [newPlatformName, setNewPlatformName] = useState('')
  const [maskOpen, setMaskOpen] = useState(false)
  // Three tabs: read-only status Overview, the Supply fleet (trucks + availability), and the
  // fuel-ordering actions (v2 Wave 11).
  const [tab, setTab] = useState<'overview' | 'fleet' | 'order'>('overview')
  useEffect(() => {
    onTabChange?.(tab)
  }, [tab, onTabChange])

  const trucks = overview?.trucks ?? []
  const standbyCount = trucks.filter((t) => !t.assigned_unit_id).length
  const unitName = (id: string): string => refuelTargets.find((u) => u.id === id)?.name ?? id

  const selectedPlatform = platforms.find((p) => p.id === selectedPlatformId) ?? null

  const submitNewPlatform = (): void => {
    const name = newPlatformName.trim()
    if (!name || !onAddPlatform) return
    onAddPlatform(name)
    setNewPlatformName('')
    setAddingPlatform(false)
  }

  // `depots` is empty on first render (still loading), so the stateful `buyDepot` seeds to
  // '' and never re-initialises. Fall back to the first real depot whenever the stored id
  // is not a current depot — this keeps the default Main Supply Point selected (and the
  // fuel dropdown populated + the order button enabled) without a sync effect.
  const effectiveDepot = depots.some((d) => d.id === buyDepot) ? buyDepot : (depots[0]?.id ?? '')

  // Fuel types offered for the chosen depot = the fuel types it already stocks.
  const fuelOptions = useMemo(() => {
    const d = overview?.depots.find((x) => x.depot.id === effectiveDepot)
    return d ? d.stocks.map((s) => s.fuel_type) : []
  }, [overview, effectiveDepot])
  const [buyFuel, setBuyFuel] = useState(fuelOptions[0] ?? '')
  const effectiveFuel = fuelOptions.includes(buyFuel) ? buyFuel : (fuelOptions[0] ?? '')

  return (
    <aside className="supply-panel" data-testid="supply-panel">
      <div className="supply-head">
        <h2>Joint-Force Supply</h2>
        <div className="supply-head-actions">
          {onShowHistory && (
            <button
              type="button"
              className="ghost"
              data-testid="order-history-open"
              onClick={onShowHistory}
            >
              Order history
            </button>
          )}
          {onShowDocs && (
            <button
              type="button"
              className="ghost"
              data-testid="info-docs-open"
              onClick={onShowDocs}
            >
              Info docs
            </button>
          )}
        </div>
      </div>

      <div className="supply-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={tab === 'overview' ? 'active' : ''}
          data-testid="supply-tab-overview"
          onClick={() => setTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'fleet'}
          className={tab === 'fleet' ? 'active' : ''}
          data-testid="supply-tab-fleet"
          onClick={() => setTab('fleet')}
        >
          Supply fleet
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'order'}
          className={tab === 'order' ? 'active' : ''}
          data-testid="supply-tab-order"
          onClick={() => setTab('order')}
        >
          Order fuel
        </button>
      </div>

      {tab === 'overview' && (
      <section className="supply-dist">
        {overview?.depots.map((d) => {
          const isLow = d.stocks.some(
            (s) => s.capacity_liters > 0 && s.quantity_liters / s.capacity_liters < LOW_FILL,
          )
          return (
          <div key={d.depot.id} className="depot-row">
            <div className="depot-name-row">
              <button
                type="button"
                className="depot-name link"
                data-testid={`depot-locate-${d.depot.id}`}
                onClick={() => onLocate?.(d.depot.lat, d.depot.lon)}
                title="Mark + locate on map"
              >
                {d.depot.name}
              </button>
              {d.depot.site_type && (
                <span className="depot-site-tag" data-testid="depot-site-tag">
                  {logisticSiteShort(d.depot.site_type)}
                </span>
              )}
              {isLow && onProposeRefuel && (
                <button
                  type="button"
                  className="ghost depot-propose"
                  data-testid={`depot-propose-${d.depot.id}`}
                  onClick={() => onProposeRefuel(d.depot.id)}
                  title="Propose a refuel/redistribution order"
                >
                  Propose refuel
                </button>
              )}
            </div>
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
          )
        })}
        <div className="fleet-summary" data-testid="fleet-summary">
          <div className="depot-name">Supply fleet</div>
          <div className="truck-row">
            <span>Fuel trucks total</span>
            <span className="stock-val" data-testid="fleet-total">
              {trucks.length}
            </span>
          </div>
          <div className="truck-row">
            <span>On standby</span>
            <span className="stock-val" data-testid="fleet-standby">
              {standbyCount}
            </span>
          </div>
          <button
            type="button"
            className="depot-name link"
            data-testid="fleet-open"
            onClick={() => setTab('fleet')}
          >
            View supply fleet →
          </button>
        </div>
      </section>
      )}

      {tab === 'fleet' && (
      <section className="supply-dist" data-testid="supply-fleet">
        {trucks.length === 0 ? (
          <p className="supply-msg" data-testid="fleet-empty">
            No fuel trucks.
          </p>
        ) : (
          trucks.map((t) => (
            <div key={t.instance_id} className="truck-fleet-row">
              <div className="truck-fleet-head">
                <button
                  type="button"
                  className="depot-name link"
                  data-testid={`truck-locate-${t.instance_id}`}
                  onClick={() => onLocate?.(t.lat, t.lon)}
                  title="Mark + locate on map"
                >
                  {t.name}
                  {unitTypeName(t.unit_type_id, unitTypes) && (
                    <span className="truck-fleet-type" data-testid={`truck-type-${t.instance_id}`}>
                      {' '}· {unitTypeName(t.unit_type_id, unitTypes)}
                    </span>
                  )}
                </button>
                <span
                  className={`truck-status ${t.assigned_unit_id ? 'tasked' : 'standby'}`}
                  data-testid={`truck-status-${t.instance_id}`}
                >
                  {t.assigned_unit_id ? `Tasked → ${unitName(t.assigned_unit_id)}` : 'On standby'}
                </span>
              </div>
              {onCreateFuelRun && (
                <button
                  type="button"
                  className="ghost fuel-run-start"
                  data-testid={`fuel-run-start-${t.instance_id}`}
                  onClick={() => onCreateFuelRun(t.instance_id, t.name)}
                >
                  Create fuel run
                </button>
              )}
              {onPlanRendezvous && (
                <button
                  type="button"
                  className="ghost rdv-start"
                  data-testid={`rdv-start-${t.instance_id}`}
                  onClick={() => onPlanRendezvous(t.instance_id, t.name)}
                >
                  Plan rendezvous
                </button>
              )}
              <div className="stock-row">
                <span className="stock-label">{t.fuel_type}</span>
                {t.current_fuel_liters == null ? (
                  <span className="stock-val">no telemetry</span>
                ) : (
                  <>
                    <span className="stock-bar">
                      <span
                        className="stock-fill"
                        style={{
                          width: `${
                            t.capacity_liters > 0
                              ? (t.current_fuel_liters / t.capacity_liters) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                    <span className="stock-val">
                      {fmt(t.current_fuel_liters)} / {fmt(t.capacity_liters)} L
                    </span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </section>
      )}

      {tab === 'order' && (
      <>
      {platforms.length > 0 && (
        <section className="supply-form platform-selector" data-testid="platform-selector">
          <h3>Fuel-management platform</h3>
          <select
            data-testid="platform-select"
            value={selectedPlatformId}
            onChange={(e) => onSelectPlatform?.(e.target.value)}
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {addingPlatform ? (
            <div className="platform-add">
              <input
                data-testid="platform-new-name"
                type="text"
                placeholder="New platform name"
                value={newPlatformName}
                onChange={(e) => setNewPlatformName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewPlatform()
                }}
              />
              <button type="button" data-testid="platform-add-confirm" onClick={submitNewPlatform}>
                Add
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setAddingPlatform(false)
                  setNewPlatformName('')
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ghost"
              data-testid="platform-add-toggle"
              onClick={() => setAddingPlatform(true)}
            >
              + Add platform
            </button>
          )}
        </section>
      )}

      <section className="supply-form">
        <h3>Order fuel → depot</h3>
        <select
          data-testid="buy-depot"
          value={effectiveDepot}
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
          disabled={busy || !effectiveDepot || !effectiveFuel || buyQty <= 0}
          onClick={() => setMaskOpen(true)}
        >
          Order fuel
        </button>
      </section>

      {maskOpen && (
        <OrderFuelMask
          platform={selectedPlatform}
          fuelType={effectiveFuel}
          destinationName={depots.find((d) => d.id === effectiveDepot)?.name ?? effectiveDepot}
          amount={buyQty}
          busy={busy}
          onClose={() => setMaskOpen(false)}
          onPlace={(amount, meta) => {
            onBuy(effectiveDepot, effectiveFuel, amount, meta)
            setMaskOpen(false)
          }}
        />
      )}

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
      </>
      )}

      {message && <div className="supply-msg">{message}</div>}
    </aside>
  )
}
