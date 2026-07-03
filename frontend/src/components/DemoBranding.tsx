// Lower-left "Powered by" branding overlay, shown only while an auto-play (demo/show) tour runs
// (v2: take-a-tour, demo expansion). Reuses the landing-page logos. Portalled to document.body so
// it layers above the driver.js overlay (z-index) regardless of the topbar's stacking context.

import { createPortal } from 'react-dom'
import './DemoBranding.css'

export function DemoBranding() {
  return createPortal(
    <div className="demo-branding" data-testid="demo-branding" aria-hidden="true">
      <span className="demo-branding-label">powered by</span>
      <span className="demo-branding-logos">
        <img src="/logos/World-Fuel-Services-Logo.png" alt="World Fuel Services" />
        <img src="/logos/eraneos_Logo-and-BrandSign-black.png" alt="Eraneos" />
      </span>
    </div>,
    document.body,
  )
}
