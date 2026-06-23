// Side "radio" chatter log (Wave 4 ops-chatter-sectors). Newest first; a message that
// references a sector is clickable and highlights that MGRS cell. Reused for the OF-8 strategic
// feed (Wave 5) via the optional title/className/testId props.
//
// v2 Wave 4 F3 (expandable-chatter-detail): a combat-event line is compact (`<MGRS> · headline`)
// and clicking it both locates (Wave-3 contract) and toggles an in-place detail block showing
// category, estimated threat, supply relevance, sim timestamp, and any generated detail.

import { useState, type ReactNode } from 'react'
import type { ChatterMessage } from '../api/types'

/** A chatter line is "expandable" when it carries combat-event detail (category or locate id). */
function isExpandable(m: ChatterMessage): boolean {
  return Boolean(m.category || m.detail || (m.event_id && m.estimated_threat !== undefined))
}

export function ChatterLog({
  messages,
  onSelect,
  onSelectEvent,
  onClose,
  title = 'Chatter',
  className = 'chatter',
  testId = 'chatter',
  emptyText = 'No radio traffic yet.',
  children,
}: {
  messages: ChatterMessage[]
  onSelect?: (h3Index: string) => void
  /** Click-to-locate a combat event (v2 Wave 3): highlights its MGRS threat square. */
  onSelectEvent?: (eventId: string) => void
  /** When set, render a close (×) button that dismisses this feed (e.g. Strategic Support). */
  onClose?: () => void
  title?: string
  className?: string
  testId?: string
  emptyText?: string
  /** Optional control strip rendered under the title (v2 Wave 4 F4: filter controls). */
  children?: ReactNode
}) {
  // Which message ids are expanded (local view state; ChatterLog stays prop-driven otherwise).
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className={className} data-testid={testId}>
      {onClose && (
        <button
          type="button"
          className="chatter-close"
          data-testid={`${testId}-close`}
          onClick={onClose}
          aria-label={`Close ${title}`}
        >
          ×
        </button>
      )}
      <h2>{title}</h2>
      {children}
      {messages.length === 0 && <div className="chatter-empty">{emptyText}</div>}
      {[...messages].reverse().map((m) => {
        const locatable = Boolean(m.event_id || m.h3_index)
        const expandable = isExpandable(m)
        const isOpen = expanded.has(m.id)
        const onLine = (): void => {
          if (m.event_id) onSelectEvent?.(m.event_id)
          else if (m.h3_index) onSelect?.(m.h3_index)
          if (expandable) toggle(m.id)
        }
        return (
          <div className="chatter-row" key={m.id} data-testid="chatter-row">
            <button
              type="button"
              className={`chatter-msg ${m.kind}${locatable || expandable ? ' clickable' : ''}`}
              data-testid="chatter-msg"
              disabled={!locatable && !expandable}
              aria-expanded={expandable ? isOpen : undefined}
              onClick={onLine}
            >
              {m.mgrs && <span className="chatter-mgrs">{m.mgrs}</span>}
              <span className="chatter-text">{m.text}</span>
              {expandable && <span className="chatter-caret">{isOpen ? '▾' : '▸'}</span>}
              {m.sender && <span className="chatter-sender">{m.sender}</span>}
            </button>
            {expandable && isOpen && (
              <dl className="chatter-detail" data-testid="chatter-detail">
                {m.category && (
                  <div className="chatter-detail-row">
                    <dt>Category</dt>
                    <dd>{m.category}</dd>
                  </div>
                )}
                {m.estimated_threat !== undefined && (
                  <div className="chatter-detail-row">
                    <dt>Est. threat</dt>
                    <dd>{m.estimated_threat}/5</dd>
                  </div>
                )}
                <div className="chatter-detail-row">
                  <dt>Supply</dt>
                  <dd>{m.supply_relevant ? 'SUPPLY-RELEVANT' : '—'}</dd>
                </div>
                {m.game_s !== undefined && (
                  <div className="chatter-detail-row">
                    <dt>Sim time</dt>
                    <dd>{`T+${Math.round(m.game_s)}s`}</dd>
                  </div>
                )}
                {m.detail && (
                  <div className="chatter-detail-row">
                    <dt>Detail</dt>
                    <dd>{m.detail}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )
      })}
    </aside>
  )
}
