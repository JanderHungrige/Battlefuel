// Side "radio" chatter log (Wave 4 ops-chatter-sectors). Newest first; a message that
// references a sector is clickable and highlights that MGRS cell. Reused for the OF-8 strategic
// feed (Wave 5) via the optional title/className/testId props.

import type { ChatterMessage } from '../api/types'

export function ChatterLog({
  messages,
  onSelect,
  onSelectEvent,
  title = 'Chatter',
  className = 'chatter',
  testId = 'chatter',
  emptyText = 'No radio traffic yet.',
}: {
  messages: ChatterMessage[]
  onSelect?: (h3Index: string) => void
  /** Click-to-locate a combat event (v2 Wave 3): highlights its MGRS threat square. */
  onSelectEvent?: (eventId: string) => void
  title?: string
  className?: string
  testId?: string
  emptyText?: string
}) {
  return (
    <aside className={className} data-testid={testId}>
      <h2>{title}</h2>
      {messages.length === 0 && <div className="chatter-empty">{emptyText}</div>}
      {[...messages].reverse().map((m) => {
        const locatable = Boolean(m.event_id || m.h3_index)
        const locate = (): void => {
          if (m.event_id) onSelectEvent?.(m.event_id)
          else if (m.h3_index) onSelect?.(m.h3_index)
        }
        return (
          <button
            key={m.id}
            type="button"
            className={`chatter-msg ${m.kind}${locatable ? ' clickable' : ''}`}
            data-testid="chatter-msg"
            disabled={!locatable}
            onClick={locate}
          >
            {m.mgrs && <span className="chatter-mgrs">{m.mgrs}</span>}
            <span className="chatter-text">{m.text}</span>
            {m.sender && <span className="chatter-sender">{m.sender}</span>}
          </button>
        )
      })}
    </aside>
  )
}
