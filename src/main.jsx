import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './styles.css'

const VIBES = [
  { id: 'joy', label: 'Кайф', icon: '🩷', color: '#ff5ea8' },
  { id: 'move', label: 'Движ', icon: '🟣', color: '#9b6cff' },
  { id: 'chill', label: 'Чилл', icon: '🟡', color: '#ffd75e' },
  { id: 'blue', label: 'Меланхолия', icon: '🔵', color: '#67a8ff' },
  { id: 'chaos', label: 'Хаос', icon: '🔴', color: '#ff665f' },
  { id: 'alone', label: 'Не трогайте', icon: '⚫', color: '#696973' },
]

const MOCK = [
  [40.515, 64.54, 'chill'], [40.522, 64.541, 'chill'], [40.53, 64.545, 'chill'],
  [40.51, 64.55, 'joy'], [40.502, 64.553, 'joy'], [40.498, 64.548, 'joy'],
  [40.535, 64.553, 'move'], [40.54, 64.558, 'move'], [40.546, 64.552, 'move'],
  [40.49, 64.535, 'blue'], [40.497, 64.532, 'blue'], [40.505, 64.531, 'blue'],
  [40.55, 64.538, 'chaos'], [40.557, 64.541, 'chaos'],
].map(([lng, lat, vibe], i) => ({
  type: 'Feature',
  id: i,
  properties: { vibe, weight: 1 },
  geometry: { type: 'Point', coordinates: [lng, lat] }
}))

function featureCollection(features) {
  return { type: 'FeatureCollection', features }
}

function App() {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [selected, setSelected] = useState(null)
  const [count, setCount] = useState(128)
  const [status, setStatus] = useState('Определяем район…')
  const [features, setFeatures] = useState(MOCK)

  const dominant = useMemo(() => {
    const counts = {}
    features.forEach(f => {
      counts[f.properties.vibe] = (counts[f.properties.vibe] || 0) + 1
    })
    const id = Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'chill'
    return VIBES.find(v => v.id === id) || VIBES[2]
  }, [features])

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [40.515, 64.54],
      zoom: 12.3,
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource('vibes', { type: 'geojson', data: featureCollection(features) })

      VIBES.forEach(v => {
        map.addLayer({
          id: 'heat-' + v.id,
          type: 'heatmap',
          source: 'vibes',
          filter: ['==', ['get', 'vibe'], v.id],
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 15, 2.1],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 32, 15, 58],
            'heatmap-opacity': 0.72,
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,0,0)',
              0.25, v.color + '22',
              0.5, v.color + '66',
              0.75, v.color + 'aa',
              1, v.color
            ]
          }
        })
      })

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { longitude, latitude } = pos.coords
            setStatus('Твоя точка найдена')
            map.easeTo({ center: [longitude, latitude], zoom: 13.5, duration: 900 })
            new maplibregl.Marker({ color: '#ffffff', scale: 0.65 })
              .setLngLat([longitude, latitude])
              .addTo(map)
          },
          () => setStatus('Показываем демо-район')
        )
      } else {
        setStatus('Показываем демо-район')
      }
    })

    map.on('movestart', () => setSheetOpen(false))

    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource('vibes')) return
    map.getSource('vibes').setData(featureCollection(features))
  }, [features])

  const chooseVibe = (vibe) => {
    setSelected(vibe.id)
    setCount(c => c + 1)

    const map = mapRef.current
    const center = map?.getCenter() || { lng: 40.515, lat: 64.54 }
    const jitter = () => (Math.random() - 0.5) * 0.006

    setFeatures(prev => [
      ...prev,
      {
        type: 'Feature',
        properties: { vibe: vibe.id, weight: 1 },
        geometry: { type: 'Point', coordinates: [center.lng + jitter(), center.lat + jitter()] }
      }
    ])

    setTimeout(() => setSheetOpen(false), 260)
  }

  return (
    <main className="app">
      <section className="topbar">
        <div>
          <p className="eyebrow">Прямо сейчас</p>
          <h1>Город сегодня на <span>{dominant.label.toLowerCase()}</span></h1>
          <p className="sub">{status} · {count} отметок за 2 часа</p>
        </div>
      </section>

      <section className="map-shell">
        <div ref={mapEl} className="map" />

        {!sheetOpen && (
          <button className="reopen" onClick={() => setSheetOpen(true)}>
            ✦ Отметить свой вайб
          </button>
        )}

        <section className={"sheet " + (sheetOpen ? 'open' : 'closed')} aria-hidden={!sheetOpen}>
          <button className="handle" onClick={() => setSheetOpen(false)} aria-label="Свернуть панель">
            <span />
          </button>
          <div className="sheet-content">
            <div className="sheet-head">
              <div>
                <h2>Какой у тебя сейчас вайб?</h2>
                <p>Один тап — и он уже на карте.</p>
              </div>
            </div>

            <div className="vibes">
              {VIBES.map(v => (
                <button
                  key={v.id}
                  className={"vibe " + (selected === v.id ? 'active' : '')}
                  onClick={() => chooseVibe(v)}
                >
                  <span className="icon">{v.icon}</span>
                  <span>{v.label}</span>
                </button>
              ))}
            </div>

            <p className="privacy">Точная геопозиция другим людям не показывается.</p>
          </div>
        </section>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)