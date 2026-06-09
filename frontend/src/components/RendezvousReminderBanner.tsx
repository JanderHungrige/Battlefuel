// Banner shown when a scheduled rendezvous comes due (v2 Wave 13 F4). The operator must confirm
// to launch — there is no silent auto-dispatch — or dismiss (the order stays `due` in the
// archive). Mirrors HaltBanner.

import type { RendezvousReminder } from '../api/types'

interface RendezvousReminderBannerProps {
  reminder: RendezvousReminder
  truckName: string
  unitName: string
  busy: boolean
  onConfirm: () => void
  onDismiss: () => void
}

export function RendezvousReminderBanner({
  reminder,
  truckName,
  unitName,
  busy,
  onConfirm,
  onDismiss,
}: RendezvousReminderBannerProps) {
  return (
    <div className="halt-banner rendezvous-reminder" role="alert" data-testid="rendezvous-reminder">
      <span className="halt-banner-text">
        ⛽ Rendezvous due — <strong>{truckName}</strong> ↔ <strong>{unitName}</strong> at sector{' '}
        {reminder.sector_h3} ({reminder.metric}). Confirm to launch.
      </span>
      <div className="halt-banner-actions">
        <button
          type="button"
          data-testid="rendezvous-reminder-confirm"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Launching…' : 'Confirm & launch'}
        </button>
        <button
          type="button"
          className="halt-dismiss"
          aria-label="Dismiss"
          data-testid="rendezvous-reminder-dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  )
}
