// Obstacle-type selector shown while obstacle mode is on (Wave 4 ops-chatter-sectors).

import { OBSTACLE_KINDS, type ObstacleKind } from './obstacleKinds'

export function ObstacleKindPicker({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (kind: ObstacleKind) => void
}) {
  return (
    <aside className="obstacle-picker" data-testid="obstacle-picker">
      <h2>Obstacle type</h2>
      {OBSTACLE_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          className={`kind-btn${selected === k ? ' active' : ''}`}
          data-testid={`kind-${k}`}
          onClick={() => onSelect(k)}
        >
          {k}
        </button>
      ))}
    </aside>
  )
}
