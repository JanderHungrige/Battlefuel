// OF-8 Order History panel (v2 Wave 11 F4): lists all historic + current fuel orders and tracks
// each through the seven NATO fulfilment stages. The current stage auto-advances on the sim clock
// (30 game-seconds per stage); this panel re-renders from the refetched order list.

import type { BuyOrder, RendezvousOrder } from '../api/types'
import { NATO_STAGES, type NatoStage, natoStageIndex, natoStageLabel } from '../lib/natoStage'

export interface OrderHistoryPanelProps {
  orders: BuyOrder[]
  onClose: () => void
  /** Scheduled rendezvous runs (v2 Wave 13 F4); omit to hide the section. */
  rendezvousOrders?: RendezvousOrder[]
  selectedRendezvousId?: string | null
  onSelectRendezvous?: (order: RendezvousOrder) => void
  onCancelRendezvous?: (id: string) => void
}

const fmt = (n: number): string => Math.round(n).toLocaleString()
const mins = (s: number): string => `${Math.max(0, Math.round(s / 60))} min`

function RendezvousSection({
  orders,
  selectedId,
  onSelect,
  onCancel,
}: {
  orders: RendezvousOrder[]
  selectedId: string | null | undefined
  onSelect?: (order: RendezvousOrder) => void
  onCancel?: (id: string) => void
}) {
  return (
    <section className="order-history-rendezvous" data-testid="order-history-rendezvous">
      <h3>Rendezvous runs</h3>
      {orders.length === 0 ? (
        <p className="order-history-empty" data-testid="rendezvous-empty">
          No rendezvous runs yet.
        </p>
      ) : (
        <ul className="rendezvous-archive-list">
          {[...orders].reverse().map((o) => {
            const pending = o.status === 'planned' || o.status === 'due'
            return (
              <li
                key={o.id}
                className={`rendezvous-archive-row ${o.id === selectedId ? 'selected' : ''}`}
                data-testid="rendezvous-archive-row"
              >
                <button
                  type="button"
                  className="rendezvous-archive-main"
                  data-testid={`rendezvous-row-${o.id}`}
                  onClick={() => onSelect?.(o)}
                  title="Draw both routes on the map"
                >
                  <span className="rendezvous-archive-pair">
                    {o.truck_id} ↔ {o.unit_id}
                  </span>
                  <span className={`rendezvous-status ${o.status}`} data-testid="rendezvous-status">
                    {o.status}
                  </span>
                  <span className="rendezvous-archive-meta">
                    {o.metric}
                    {o.status === 'planned' ? ` · in ${mins(o.remaining_game_s)}` : ''}
                  </span>
                </button>
                {pending && onCancel && (
                  <button
                    type="button"
                    className="ghost rendezvous-cancel"
                    data-testid={`rendezvous-cancel-${o.id}`}
                    onClick={() => onCancel(o.id)}
                  >
                    Cancel
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function StageTrack({ stage, cancelled }: { stage: NatoStage; cancelled: boolean }) {
  const current = natoStageIndex(stage)
  return (
    <ol className="order-stages" data-testid="order-stages">
      {NATO_STAGES.map((s, i) => {
        const state = cancelled ? 'cancelled' : i < current ? 'done' : i === current ? 'current' : 'pending'
        return (
          <li key={s} className={`order-stage ${state}`} title={natoStageLabel(s)}>
            <span className="order-stage-dot" />
          </li>
        )
      })}
    </ol>
  )
}

export function OrderHistoryPanel({
  orders,
  onClose,
  rendezvousOrders,
  selectedRendezvousId,
  onSelectRendezvous,
  onCancelRendezvous,
}: OrderHistoryPanelProps) {
  // Newest first — orders carry no client timestamp, so reverse the server (creation) order.
  const ordered = [...orders].reverse()
  return (
    <aside className="order-history-panel" data-testid="order-history-panel">
      <div className="order-history-head">
        <h2>Order history</h2>
        <button type="button" className="ghost" data-testid="order-history-close" onClick={onClose}>
          Close
        </button>
      </div>

      {rendezvousOrders !== undefined && (
        <RendezvousSection
          orders={rendezvousOrders}
          selectedId={selectedRendezvousId}
          onSelect={onSelectRendezvous}
          onCancel={onCancelRendezvous}
        />
      )}

      {ordered.length === 0 ? (
        <p className="order-history-empty" data-testid="order-history-empty">
          No fuel orders yet.
        </p>
      ) : (
        <ul className="order-history-list">
          {ordered.map((o) => {
            const cancelled = o.status === 'cancelled'
            const stage = (o.nato_stage ?? 'placed') as NatoStage
            const informed = [o.inform_jlsg ? 'JLSG' : null, o.inform_jtf ? 'JTF HQ' : null]
              .filter(Boolean)
              .join(', ')
            return (
              <li key={o.id} className="order-history-row" data-testid="order-history-row">
                <div className="order-history-row-head">
                  <span className="order-history-amount">
                    {fmt(o.quantity_liters)} L {o.fuel_type}
                  </span>
                  <span className="order-history-dest">
                    → {o.destination_name ?? o.depot_id}
                  </span>
                </div>
                <StageTrack stage={stage} cancelled={cancelled} />
                <div className="order-history-meta">
                  <span data-testid="order-history-stage">
                    {cancelled ? 'Cancelled' : natoStageLabel(stage)}
                  </span>
                  {o.platform_id && <span className="order-history-platform">{o.platform_id}</span>}
                  {informed && <span className="order-history-informed">inform: {informed}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
