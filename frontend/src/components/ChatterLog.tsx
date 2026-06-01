// Side "radio" chatter log (Wave 4 ops-chatter-sectors). Newest first; a message that
// references a sector is clickable and highlights that hex. Reused for the OF-8 strategic
// feed (Wave 5) via the optional title/className/testId props.

import type { ChatterMessage } from '../api/types'

export function ChatterLog({
  messages,
  onSelect,
  title = 'Chatter',
  className = 'chatter',
  testId = 'chatter',
  emptyText = 'No radio traffic yet.',
}: {
  messages: ChatterMessage[]
  onSelect?: (h3Index: string) => void
  title?: string
  className?: string
  testId?: string
  emptyText?: string
}) {
  return (
    <aside className={className} data-testid={testId}>
      <h2>{title}</h2>
      {messages.length === 0 && <div className="chatter-empty">{emptyText}</div>}
      {[...messages].reverse().map((m) => (
        <button
          key={m.id}
          type="button"
          className={`chatter-msg ${m.kind}${m.h3_index ? ' clickable' : ''}`}
          data-testid="chatter-msg"
          disabled={!m.h3_index}
          onClick={() => m.h3_index && onSelect?.(m.h3_index)}
        >
          {m.text}
        </button>
      ))}
    </aside>
  )
}
