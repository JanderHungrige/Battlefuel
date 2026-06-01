// OF-4 ↔ OF-8 role switch shown in the topbar (Wave 5 role-view-switch).

import { ROLES, type Role } from '../roles'

export function RoleToggle({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div className="role-toggle" data-testid="role-toggle" role="group" aria-label="Operator role">
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          title={r.title}
          className={`role-btn${role === r.id ? ' active' : ''}`}
          data-testid={`role-${r.id}`}
          aria-pressed={role === r.id}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
