import { latLngToCell } from 'h3-js'
import { describe, expect, it, vi } from 'vitest'
import type { TileUpdate, UnitUpdate } from '../api/types'
import {
  applyEnemyUnit,
  applyTileUpdate,
  applyUnitUpdate,
  describeBuyOrderUpdate,
  describeRefuelOrderUpdate,
  describeRendezvousReminder,
  parseBuyOrderUpdate,
  parseEnemyUnit,
  parseEnemyUnitRemoved,
  parseRefuelOrderUpdate,
  parseRendezvousReminder,
  parseStrategicMessage,
  parseTileUpdate,
  parseUnitUpdate,
  removeEnemyUnit,
  tileEventChatter,
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
  situation: null,
  note: null,
  last_event: null,
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

describe('tileEventChatter', () => {
  const hohenfelsCell = latLngToCell(49.2, 11.85, 8)

  const eventTile = (lastEvent: object) => ({
    ...tileFrame,
    h3_index: hohenfelsCell,
    threat_level: 4,
    last_event: {
      headline: 'Hostile unit spotted / identified',
      category: 'Threat Events',
      sender: 'RECON 2-7',
      supply_relevant: false,
      at_game_s: 120,
      ...lastEvent,
    },
  })

  it('builds an expandable "<MGRS> — <headline>" line, MGRS at the event precision', () => {
    const msg = tileEventChatter(eventTile({ precision_m: 2000 }), 7)
    expect(msg?.text).toBe('Hostile unit spotted / identified')
    // 2 km location detail → 2-digit MGRS grid number.
    expect(msg?.mgrs).toMatch(/^32U [A-Z]{2} \d{2} \d{2}$/)
    expect(msg?.category).toBe('Threat Events')
    expect(msg?.estimated_threat).toBe(4)
    expect(msg?.precision_m).toBe(2000)
    expect(msg?.h3_index).toBe(hohenfelsCell)
  })

  it('shows a finer MGRS for a pinpoint (100 m) event', () => {
    const msg = tileEventChatter(eventTile({ headline: 'IED / mine', precision_m: 100 }), 8)
    expect(msg?.mgrs).toMatch(/^32U [A-Z]{2} \d{3} \d{3}$/) // 100 m → 3 digits
  })

  it('defaults to 1 km precision when the event carries none', () => {
    const msg = tileEventChatter(eventTile({}), 9)
    expect(msg?.mgrs).toMatch(/^32U [A-Z]{2} \d{2} \d{2}$/)
    expect(msg?.precision_m).toBe(1000)
  })

  it('returns null when the tile carries no event (a revert/decay update)', () => {
    expect(tileEventChatter({ ...tileFrame, h3_index: hohenfelsCell }, 1)).toBeNull()
  })
})

describe('parseBuyOrderUpdate / parseRefuelOrderUpdate', () => {
  it('parses a valid buy_order_update and rejects other frames', () => {
    const ok = parseBuyOrderUpdate(
      JSON.stringify({
        type: 'buy_order_update',
        order_id: 'b1',
        depot_id: 'depot-main',
        fuel_type: 'diesel',
        quantity_liters: 5000,
        status: 'delivered',
        remaining_game_s: 0,
      }),
    )
    expect(ok?.order_id).toBe('b1')
    expect(parseBuyOrderUpdate(JSON.stringify({ type: 'unit_update' }))).toBeNull()
    expect(parseBuyOrderUpdate('not json')).toBeNull()
  })

  it('parses a valid refuel_order_update', () => {
    const ok = parseRefuelOrderUpdate(
      JSON.stringify({
        type: 'refuel_order_update',
        order_id: 'r1',
        unit_id: 'inst-armor-1',
        truck_id: 'inst-fuel-1',
        status: 'complete',
        fuel_type: 'diesel',
        transferred_liters: 3000,
      }),
    )
    expect(ok?.truck_id).toBe('inst-fuel-1')
    expect(parseRefuelOrderUpdate(JSON.stringify({ type: 'tile_update' }))).toBeNull()
  })

  it('describes order frames for the feed', () => {
    expect(
      describeBuyOrderUpdate({
        type: 'buy_order_update',
        order_id: 'b1',
        depot_id: 'depot-main',
        fuel_type: 'diesel',
        quantity_liters: 5000,
        status: 'delivered',
        remaining_game_s: 0,
      }),
    ).toContain('depot-main')
    // A mid-flight stage frame describes the NATO stage (v2 Wave 11 F4).
    expect(
      describeBuyOrderUpdate({
        type: 'buy_order_update',
        order_id: 'b2',
        depot_id: 'depot-main',
        fuel_type: 'diesel',
        quantity_liters: 5000,
        status: 'active',
        remaining_game_s: 100,
        nato_stage: 'on_route',
      }),
    ).toContain('Fuel on route')
    expect(
      describeRefuelOrderUpdate({
        type: 'refuel_order_update',
        order_id: 'r1',
        unit_id: 'inst-armor-1',
        truck_id: 'inst-fuel-1',
        status: 'complete',
        fuel_type: 'diesel',
        transferred_liters: 3000,
      }),
    ).toContain('inst-armor-1')
  })
})

describe('parseStrategicMessage', () => {
  it('parses a valid strategic_message and rejects others', () => {
    const ok = parseStrategicMessage(
      JSON.stringify({ type: 'strategic_message', text: 'convoy inbound', category: 'logistics', game_s: 60 }),
    )
    expect(ok?.text).toBe('convoy inbound')
    expect(parseStrategicMessage(JSON.stringify({ type: 'unit_update' }))).toBeNull()
    expect(parseStrategicMessage('nope')).toBeNull()
  })
})

const enemyFrame = {
  type: 'enemy_unit',
  id: 'catalog-012',
  name: 'Hostile unit spotted / identified',
  sidc: '10061000131606000000',
  lat: 49.24,
  lon: 11.85,
  echelon: 'section',
}

describe('parseEnemyUnit', () => {
  it('parses a valid enemy_unit frame', () => {
    const parsed = parseEnemyUnit(JSON.stringify(enemyFrame))
    expect(parsed?.id).toBe('catalog-012')
    expect(parsed?.sidc).toBe('10061000131606000000')
    expect(parsed?.lat).toBe(49.24)
  })

  it('rejects wrong-type, missing-id, non-numeric-coord, and malformed frames', () => {
    expect(parseEnemyUnit(JSON.stringify({ type: 'unit_update' }))).toBeNull()
    expect(parseEnemyUnit(JSON.stringify({ ...enemyFrame, id: undefined }))).toBeNull()
    expect(parseEnemyUnit(JSON.stringify({ ...enemyFrame, lat: 'x' }))).toBeNull()
    expect(parseEnemyUnit('not json')).toBeNull()
  })
})

describe('applyEnemyUnit', () => {
  it('keeps the latest sighting per id (updates a contact) without mutating the input', () => {
    const prev = {}
    const s1 = applyEnemyUnit(prev, enemyFrame)
    expect(s1['catalog-012'].lat).toBe(49.24)
    expect(prev).toEqual({})
    const s2 = applyEnemyUnit(s1, { ...enemyFrame, lat: 49.25, lon: 11.86 })
    expect(Object.keys(s2)).toHaveLength(1) // dedup by id
    expect(s2['catalog-012'].lat).toBe(49.25)
  })
})

describe('parseEnemyUnitRemoved / removeEnemyUnit', () => {
  it('parses the removed sighting id', () => {
    expect(parseEnemyUnitRemoved(JSON.stringify({ type: 'enemy_unit_removed', id: 'sight-1' }))).toBe(
      'sight-1',
    )
    expect(parseEnemyUnitRemoved(JSON.stringify({ type: 'enemy_unit', id: 'x' }))).toBeNull()
  })

  it('drops the sighting by id (and leaves the map untouched when absent)', () => {
    const s1 = applyEnemyUnit({}, enemyFrame)
    expect(removeEnemyUnit(s1, 'catalog-012')).toEqual({})
    expect(removeEnemyUnit(s1, 'missing')).toBe(s1) // unchanged reference
  })
})

describe('parseRendezvousReminder', () => {
  const raw = JSON.stringify({
    type: 'rendezvous_reminder',
    order_id: 'rdv-1',
    truck_id: 'inst-fuel-1',
    unit_id: 'inst-armor-1',
    sector_lat: 49.2,
    sector_lon: 11.8,
    sector_h3: '8abc',
    metric: 'safe',
    status: 'due',
  })

  it('parses a valid rendezvous_reminder frame', () => {
    const r = parseRendezvousReminder(raw)
    expect(r?.order_id).toBe('rdv-1')
    expect(r?.unit_id).toBe('inst-armor-1')
    expect(r?.status).toBe('due')
  })

  it('rejects other frame types and malformed input', () => {
    expect(parseRendezvousReminder(JSON.stringify({ type: 'unit_update' }))).toBeNull()
    expect(parseRendezvousReminder('not json')).toBeNull()
  })

  it('describes a due rendezvous for the strategic feed', () => {
    const r = parseRendezvousReminder(raw)
    expect(r && describeRendezvousReminder(r)).toContain('Rendezvous due')
  })
})
