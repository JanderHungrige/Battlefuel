import { describe, expect, it } from 'vitest'
import { buildBasemapStyle } from './basemapStyle'

describe('buildBasemapStyle', () => {
  const style = buildBasemapStyle('http://localhost:5173/hohenfels.pmtiles')

  it('is a v8 style', () => {
    expect(style.version).toBe(8)
  })

  it('uses the pmtiles protocol for the basemap source', () => {
    const src = style.sources.basemap
    expect(src.type).toBe('vector')
    expect('url' in src && src.url).toBe('pmtiles://http://localhost:5173/hohenfels.pmtiles')
  })

  it('renders background, areas, and roads layers (no text/glyph layers)', () => {
    const ids = style.layers.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['background', 'areas', 'roads']))
    expect(style.layers.some((l) => l.type === 'symbol')).toBe(false)
  })

  it('uses a classic LIGHT background (not the old dark theme)', () => {
    const bg = style.layers.find((l) => l.id === 'background')
    expect(bg?.type).toBe('background')
    const color = bg?.type === 'background' ? bg.paint?.['background-color'] : undefined
    expect(color).toBe('#eadbc8')
    expect(color).not.toBe('#0e1116')
  })
})
