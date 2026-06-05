// Faked branded fuel-order mask (v2 Wave 11 F3). Opened from the OF-8 "Order fuel" button:
// shows the selected fuel-platform branding on top, the fuel type / destination prefilled, an
// editable amount, "inform" checkboxes (JLSG, JTF HQ), and a Place order button.

import { useState } from 'react'
import type { FuelPlatform } from '../api/types'
import { platformLogoSrc } from '../lib/platformLogo'

export interface OrderMeta {
  platformId: string | null
  informJlsg: boolean
  informJtf: boolean
  destinationName: string
}

export interface OrderFuelMaskProps {
  platform: FuelPlatform | null
  fuelType: string
  destinationName: string
  amount: number
  busy?: boolean
  onPlace: (amount: number, meta: OrderMeta) => void
  onClose: () => void
}

const fmt = (n: number): string => Math.round(n).toLocaleString()

export function OrderFuelMask({
  platform,
  fuelType,
  destinationName,
  amount,
  busy = false,
  onPlace,
  onClose,
}: OrderFuelMaskProps) {
  const [qty, setQty] = useState(amount)
  const [informJlsg, setInformJlsg] = useState(false)
  const [informJtf, setInformJtf] = useState(false)

  const logo = platformLogoSrc(platform?.logo_key)
  const platformName = platform?.name ?? 'Direct order'

  const place = (): void => {
    if (qty <= 0) return
    onPlace(qty, {
      platformId: platform?.id ?? null,
      informJlsg,
      informJtf,
      destinationName,
    })
  }

  return (
    <div className="order-mask-backdrop" data-testid="order-mask" role="dialog" aria-modal="true">
      <div className="order-mask">
        <header className="order-mask-brand">
          {logo ? (
            <img src={logo} alt={platformName} className="order-mask-logo" />
          ) : (
            <span className="order-mask-badge" data-testid="order-mask-badge">
              {platformName}
            </span>
          )}
          <span className="order-mask-platform">{platformName}</span>
        </header>

        <h3>Place fuel order</h3>
        <dl className="order-mask-fields">
          <div>
            <dt>Fuel type</dt>
            <dd data-testid="order-mask-fuel">{fuelType}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd data-testid="order-mask-destination">{destinationName}</dd>
          </div>
          <div>
            <dt>Amount (L)</dt>
            <dd>
              <input
                data-testid="order-mask-amount"
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </dd>
          </div>
        </dl>

        <fieldset className="order-mask-inform">
          <legend>Inform</legend>
          <label>
            <input
              data-testid="order-mask-inform-jlsg"
              type="checkbox"
              checked={informJlsg}
              onChange={(e) => setInformJlsg(e.target.checked)}
            />
            JLSG
          </label>
          <label>
            <input
              data-testid="order-mask-inform-jtf"
              type="checkbox"
              checked={informJtf}
              onChange={(e) => setInformJtf(e.target.checked)}
            />
            JTF HQ
          </label>
        </fieldset>

        <p className="order-mask-summary">
          Order {fmt(qty)} L {fuelType} → {destinationName} via {platformName}.
        </p>

        <div className="order-mask-actions">
          <button
            type="button"
            data-testid="order-mask-place"
            disabled={busy || qty <= 0}
            onClick={place}
          >
            Place order
          </button>
          <button type="button" className="ghost" data-testid="order-mask-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
