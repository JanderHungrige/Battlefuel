// Map a fuel-platform `logo_key` to a committed logo served from /logos/ (v2 Wave 11 F3).
// sync-assets copies `company Logos/` into `public/logos/` at dev/build time. Only keys with a
// committed asset are mapped; unknown/empty keys return null so the order mask falls back to a
// text badge (e.g. Shell FM until its logo is provided, and any operator-added platform).

const LOGO_FILES: Record<string, string> = {
  'world-fuel': 'World-Fuel-Services-Logo.png',
  'shell-fm': 'shell-logo-png-transparent.png',
  eraneos: 'eraneos_Logo-and-BrandSign-black.png',
}

export function platformLogoSrc(logoKey: string | null | undefined): string | null {
  if (!logoKey) return null
  const file = LOGO_FILES[logoKey]
  return file ? `/logos/${file}` : null
}
