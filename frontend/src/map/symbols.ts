// Render an APP-6 / MIL-STD-2525 SIDC to an ImageData via milsymbol, for use as a
// MapLibre icon (map.addImage). Runtime-only (needs a canvas) — not unit-tested.

import ms from 'milsymbol'

export interface SymbolImage {
  data: ImageData
  width: number
  height: number
}

export function sidcToImage(sidc: string, size = 28): SymbolImage | null {
  if (!sidc) return null
  const canvas = new ms.Symbol(sidc, { size }).asCanvas() as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  if (ctx === null || canvas.width === 0 || canvas.height === 0) return null
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height), width: canvas.width, height: canvas.height }
}

/** The raw milsymbol canvas for a SIDC, for compositing into a larger icon (e.g. depot + bars). */
export function sidcToCanvas(sidc: string, size = 26): HTMLCanvasElement | null {
  if (!sidc) return null
  const canvas = new ms.Symbol(sidc, { size }).asCanvas() as HTMLCanvasElement
  return canvas.width > 0 && canvas.height > 0 ? canvas : null
}
