import { describe, expect, it } from 'vitest'
import { type TruckLike, nearestFuelTruck } from './fuelRun'

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
