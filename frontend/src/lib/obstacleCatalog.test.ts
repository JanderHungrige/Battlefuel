import { describe, expect, it } from 'vitest'
import type { CombatEventCatalogItem } from '../api/types'
import { catalogToObstacleTemplate, filterCatalog } from './obstacleCatalog'

function item(over: Partial<CombatEventCatalogItem> = {}): CombatEventCatalogItem {
  return {
    id: '001-test',
    category: 'Movement & Access',
    event: 'Chokepoint / bottleneck identified',
    threat_level: 3,
    supply_relevant: true,
    ...over,
  }
}

describe('catalogToObstacleTemplate', () => {
  it('maps mine/IED events to a blocked minefield', () => {
    const t = catalogToObstacleTemplate(item({ event: 'IED / mine detected or detonated' }))
    expect(t.kind).toBe('minefield')
    expect(t.mutation.road_condition).toBe('blocked')
  })

  it('maps destroyed road/bridge to a crater', () => {
    expect(catalogToObstacleTemplate(item({ event: 'Road / bridge destroyed or damaged' })).kind).toBe(
      'crater',
    )
  })

  it('maps chokepoint/degraded to a damaged roadblock', () => {
    const t = catalogToObstacleTemplate(item({ event: 'Chokepoint / bottleneck identified' }))
    expect(t.kind).toBe('roadblock')
    expect(t.mutation.road_condition).toBe('damaged')
  })

  it('maps civilian traffic to a barricade and checkpoints to a checkpoint', () => {
    expect(catalogToObstacleTemplate(item({ event: 'Civilian traffic blocking MSR' })).kind).toBe(
      'barricade',
    )
    expect(catalogToObstacleTemplate(item({ event: 'Border crossing opened / closed' })).kind).toBe(
      'checkpoint',
    )
  })

  it('falls back by threat: high → roadblock, low → checkpoint', () => {
    expect(
      catalogToObstacleTemplate(item({ event: 'Something unusual', threat_level: 5 })).kind,
    ).toBe('roadblock')
    expect(
      catalogToObstacleTemplate(item({ event: 'Something unusual', threat_level: 1 })).kind,
    ).toBe('checkpoint')
  })

  it('always carries the event threat + note in the mutation', () => {
    const t = catalogToObstacleTemplate(item({ event: 'Minefield confirmed on MSR', threat_level: 5 }))
    expect(t.mutation.threat_level).toBe(5)
    expect(t.mutation.note).toBe('Minefield confirmed on MSR')
    expect(t.label).toBe('Minefield confirmed on MSR')
  })
})

describe('filterCatalog', () => {
  const items = [
    item({ id: 'a', category: 'Movement & Access', event: 'Chokepoint identified' }),
    item({ id: 'b', category: 'Refueling & Fuel', event: 'Fuel depot critically low' }),
  ]

  it('returns all items for an empty query', () => {
    expect(filterCatalog(items, '   ')).toHaveLength(2)
  })

  it('matches category or event text case-insensitively', () => {
    expect(filterCatalog(items, 'FUEL').map((i) => i.id)).toEqual(['b'])
    expect(filterCatalog(items, 'chokepoint').map((i) => i.id)).toEqual(['a'])
    expect(filterCatalog(items, 'movement').map((i) => i.id)).toEqual(['a'])
  })
})
