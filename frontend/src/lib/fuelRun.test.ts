import { describe, expect, it } from 'vitest'
import { type DepotLike, type TruckLike, nearestFuelSource, nearestFuelTruck } from './fuelRun'

const trucks: TruckLike[] = [
  { instance_id: 't1', name: 'TANKER', fuel_type: 'diesel', current_fuel_liters: 3800, lat: 49.20, lon: 11.83 },
  { instance_id: 't2', name: 'BOWSER', fuel_type: 'diesel', current_fuel_liters: 4000, lat: 49.23, lon: 11.86 },
  { instance_id: 't3', name: 'EMPTY', fuel_type: 'diesel', current_fuel_liters: 0, lat: 49.23, lon: 11.861 },
  { instance_id: 't4', name: 'JET', fuel_type: 'jp8', current_fuel_liters: 5000, lat: 49.231, lon: 11.861 },
]

describe('nearestFuelTruck', () => {
  it('picks the closest fuelled truck of the matching fuel type', () => {
    // Near (49.232, 11.862): BOWSER is closest diesel truck with fuel (EMPTY is drained, JET is jp8).
    expect(nearestFuelTruck(49.232, 11.862, trucks, 'diesel')?.instance_id).toBe('t2')
  })

  it('ignores drained and wrong-fuel trucks', () => {
    expect(nearestFuelTruck(49.231, 11.861, trucks, 'jp8')?.instance_id).toBe('t4')
  })

  it('returns null when no compatible fuelled truck exists', () => {
    expect(nearestFuelTruck(49.2, 11.8, trucks, 'avgas')).toBeNull()
    expect(nearestFuelTruck(49.2, 11.8, [trucks[2]], 'diesel')).toBeNull()
  })
})

const depots: DepotLike[] = [
  { id: 'd1', name: 'Main', lat: 49.2005, lon: 11.8005, stocks: [{ fuel_type: 'diesel', quantity_liters: 60000 }] },
  { id: 'd2', name: 'Empty', lat: 49.2, lon: 11.8, stocks: [{ fuel_type: 'diesel', quantity_liters: 0 }] },
]

describe('nearestFuelSource', () => {
  it('picks a nearby depot over a far truck', () => {
    // At (49.2, 11.8): depot Main is adjacent; trucks are ~0.03° away.
    const s = nearestFuelSource(49.2, 11.8, trucks, depots, 'diesel')
    expect(s).toEqual({ kind: 'depot', id: 'd1', name: 'Main', lat: 49.2005, lon: 11.8005 })
  })

  it('picks a truck when it is closer than any stocked depot', () => {
    const s = nearestFuelSource(49.23, 11.86, trucks, depots, 'diesel')
    expect(s?.kind).toBe('truck')
    expect(s?.id).toBe('t2')
  })

  it('ignores depots with no stock of the fuel type', () => {
    const s = nearestFuelSource(49.2, 11.8, [], [depots[1]], 'diesel')
    expect(s).toBeNull()
  })
})
