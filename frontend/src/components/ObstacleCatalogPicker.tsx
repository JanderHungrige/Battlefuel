// Searchable obstacle picker backed by the combat-event catalog (v2 Wave 4 F7). Replaces the
// five hard-coded kind buttons: the operator searches categories/events and picks a template,
// which prefills the obstacle kind + tile defaults applied on placement. Presentational —
// items in, selected template out.

import { useMemo, useState } from 'react'
import type { CombatEventCatalogItem } from '../api/types'
import { catalogToObstacleTemplate, filterCatalog, type ObstacleTemplate } from '../lib/obstacleCatalog'

export function ObstacleCatalogPicker({
  items,
  selectedId,
  onSelect,
}: {
  items: CombatEventCatalogItem[]
  selectedId: string
  onSelect: (template: ObstacleTemplate) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => filterCatalog(items, query), [items, query])

  return (
    <aside className="obstacle-picker obstacle-catalog" data-testid="obstacle-catalog">
      <h2>Obstacle catalog</h2>
      <input
        type="search"
        className="obstacle-search"
        data-testid="obstacle-search"
        placeholder="Search events…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="obstacle-catalog-list" data-testid="obstacle-catalog-list">
        {items.length === 0 && <div className="chatter-empty">Loading catalog…</div>}
        {items.length > 0 && filtered.length === 0 && (
          <div className="chatter-empty">No matching events.</div>
        )}
        {filtered.map((item) => {
          const tpl = catalogToObstacleTemplate(item)
          return (
            <button
              key={item.id}
              type="button"
              className={`catalog-item${selectedId === item.id ? ' active' : ''}`}
              data-testid={`catalog-item-${item.id}`}
              onClick={() => onSelect(tpl)}
            >
              <span className="catalog-event">{item.event}</span>
              <span className="catalog-meta">
                {item.category} · {tpl.kind} · T{item.threat_level}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
