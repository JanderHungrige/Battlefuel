// Side "radio" chatter log (Wave 4 ops-chatter-sectors). Newest first; a message that
// references a sector is clickable and highlights that hex.

import type { ChatterMessage } from '../api/types'

export function ChatterLog({
  messages,
  onSelect,
}: {
  messages: ChatterMessage[]
  onSelect: (h3Index: string) => void
}) {
  return (
    <aside className="chatter" data-testid="chatter">
      <h2>Chatter</h2>
      {messages.length === 0 && <div className="chatter-empty">No radio traffic yet.</div>}
      {[...messages].reverse().map((m) => (
        <button
          key={m.id}
          type="button"
          className={`chatter-msg ${m.kind}${m.h3_index ? ' clickable' : ''}`}
          data-testid="chatter-msg"
          disabled={!m.h3_index}
          onClick={() => m.h3_index && onSelect(m.h3_index)}
        >
          {m.text}
        </button>
      ))}
    </aside>
  )
}
