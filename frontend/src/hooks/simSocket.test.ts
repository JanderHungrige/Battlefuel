import { describe, expect, it, vi } from 'vitest'
import type { TileUpdate, UnitUpdate } from '../api/types'
import {
  applyTileUpdate,
  applyUnitUpdate,
  parseTileUpdate,
  parseUnitUpdate,
} from './simSocket'

const frame: UnitUpdate = {
  type: 'unit_update',
  instance_id: 'inst-1',
  order_id: 'o1',
  lat: 49.22,
  lon: 11.85,
  fuel_l: 1500,
  status: 'active',
  progress_m: 1200,
  distance_m: 5000,
}

describe('parseUnitUpdate', () => {
  it('parses a valid unit_update frame', () => {
    const parsed = parseUnitUpdate(JSON.stringify(frame))
    expect(parsed).not.toBeNull()
    expect(parsed?.instance_id).toBe('inst-1')
    expect(parsed?.fuel_l).toBe(1500)
  })

  it('returns null for a frame of the wrong type', () => {
    expect(parseUnitUpdate(JSON.stringify({ type: 'pong' }))).toBeNull()
  })

  it('returns null when instance_id is missing', () => {
    expect(parseUnitUpdate(JSON.stringify({ type: 'unit_update' }))).toBeNull()
  })

  it('logs and returns null for malformed JSON (does not throw)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseUnitUpdate('not json')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('applyUnitUpdate', () => {
  it('adds a new instance and replaces an older frame for the same instance', () => {
    const s1 = applyUnitUpdate({}, frame)
    expect(s1['inst-1'].progress_m).toBe(1200)
    const s2 = applyUnitUpdate(s1, { ...frame, progress_m: 3400 })
    expect(s2['inst-1'].progress_m).toBe(3400)
  })

  it('does not mutate the previous state', () => {
    const prev = {}
    applyUnitUpdate(prev, frame)
    expect(prev).toEqual({})
  })
})

const tileFrame: TileUpdate = {
  type: 'tile_update',
  h3_index: '8811aa',
  terrain: 'forest',
  threat_level: 4,
  road_condition: 'damaged',
  intel_level: 'high',
  weather: 'clear',
  cover: 'none',
}

describe('parseTileUpdate', () => {
  it('parses a valid tile_update frame', () => {
    const parsed = parseTileUpdate(JSON.stringify(tileFrame))
    expect(parsed?.h3_index).toBe('8811aa')
    expect(parsed?.threat_level).toBe(4)
  })

  it('returns null for a unit_update frame or malformed json', () => {
    expect(parseTileUpdate(JSON.stringify(frame))).toBeNull()
    expect(parseTileUpdate('not json')).toBeNull()
  })
})

describe('applyTileUpdate', () => {
  it('keeps the latest frame per h3_index and does not mutate the input', () => {
    const prev = {}
    const s1 = applyTileUpdate(prev, tileFrame)
    expect(s1['8811aa'].threat_level).toBe(4)
    expect(prev).toEqual({})
    const s2 = applyTileUpdate(s1, { ...tileFrame, threat_level: 1 })
    expect(s2['8811aa'].threat_level).toBe(1)
  })
})
