import { useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import type { Theater, Tile, UnitInstance, UnitType } from './api/types'
import { InspectPanel } from './components/InspectPanel'
import { OSM_ATTRIBUTION } from './config'
import { MapView } from './map/MapView'
import { TERRAIN_COLORS } from './map/overlays'

export default function App() {
  const [theater, setTheater] = useState<Theater | null>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [units, setUnits] = useState<UnitInstance[]>([])
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([])
  const [error, setError] = useState<string | null>(null)

  const [selectedTileH3, setSelectedTileH3] = useState<string | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.getTheater(), api.getTiles(), api.getUnitInstances(), api.getUnitTypes()])
      .then(([t, ti, u, ut]) => {
        if (!active) return
        setTheater(t)
        setTiles(ti)
        setUnits(u)
        setUnitTypes(ut)
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      active = false
    }
  }, [])

  const selectedTile = useMemo(
    () => tiles.find((t) => t.h3_index === selectedTileH3),
    [tiles, selectedTileH3],
  )
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId),
    [units, selectedUnitId],
  )
  const selectedUnitType = useMemo(
    () => unitTypes.find((ut) => ut.id === selectedUnit?.unit_type_id),
    [unitTypes, selectedUnit],
  )

  const ready = theater !== null
  const clear = () => {
    setSelectedTileH3(null)
    setSelectedUnitId(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">BattleFuel</span>
        {theater && <span className="theater">{theater.name}</span>}
        <span className="spacer" />
        <span className="attribution">{OSM_ATTRIBUTION}</span>
      </header>
      <main className="map-area">
        {error && <div className="status error">Failed to load: {error}</div>}
        {!error && !ready && <div className="status">Loading theater…</div>}
        {ready && theater && (
          <>
            <MapView
              theater={theater}
              tiles={tiles}
              units={units}
              unitTypes={unitTypes}
              onSelectTile={(h3) => {
                setSelectedUnitId(null)
                setSelectedTileH3(h3)
              }}
              onSelectUnit={(id) => {
                setSelectedTileH3(null)
                setSelectedUnitId(id)
              }}
              onClearSelection={clear}
            />
            <TerrainLegend />
            <InspectPanel
              tile={selectedTile}
              unit={selectedUnit}
              unitType={selectedUnitType}
              onClose={clear}
            />
          </>
        )}
      </main>
    </div>
  )
}

function TerrainLegend() {
  return (
    <div className="legend" data-testid="legend">
      {Object.entries(TERRAIN_COLORS).map(([terrain, color]) => (
        <span key={terrain} className="legend-item">
          <span className="legend-swatch" style={{ background: color }} />
          {terrain}
        </span>
      ))}
    </div>
  )
}
