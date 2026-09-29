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

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

function makeMapVibey(map) {
  for (const layer of map.getStyle().layers || []) {
    const id = layer.id.toLowerCase()

    // Strip technical/navigation clutter, but keep useful place/POI names.
    if (
      id.includes('housenumber') ||
      id.includes('house-number') ||
      id.includes('parking') ||
      id.includes('transit') ||
      id.includes('railway-label') ||
      id.includes('airport-label') ||
      id.includes('road-label') ||
      id.includes('highway-label') ||
      id.includes('motorway-label') ||
      id.includes('poi') ||
      id.includes('icon') ||
      id.includes('symbol')
    ) {
      map.setLayoutProperty(layer.id, 'visibility', 'none')
      continue
    }

    if (layer.type === 'background') {
      map.setPaintProperty(layer.id, 'background-color', '#09090b')
    }

    if (layer.type === 'fill') {
      if (id.includes('water')) map.setPaintProperty(layer.id, 'fill-color', '#15171b')
      else if (id.includes('building')) map.setPaintProperty(layer.id, 'fill-color', '#202126')
      else if (id.includes('park') || id.includes('landcover') || id.includes('landuse') || id.includes('wood')) {
        map.setPaintProperty(layer.id, 'fill-color', '#111216')
      }
    }

    if (layer.type === 'line') {
      if (id.includes('water')) map.setPaintProperty(layer.id, 'line-color', '#262930')
      else if (id.includes('road') || id.includes('street') || id.includes('motorway') || id.includes('highway')) {
        map.setPaintProperty(layer.id, 'line-color', id.includes('major') || id.includes('motorway') ? '#a5a7ad' : '#555860')
      } else if (id.includes('rail')) {
        map.setPaintProperty(layer.id, 'line-color', '#35373d')
      }
    }

    if (layer.type === 'symbol') {
      if (map.getPaintProperty(layer.id, 'text-color') !== undefined) {
        map.setPaintProperty(layer.id, 'text-color', '#b9bbc2')
      }
      if (map.getPaintProperty(layer.id, 'text-halo-color') !== undefined) {
        map.setPaintProperty(layer.id, 'text-halo-color', '#09090b')
      }
    }
  }
}

const MOCK = [
  [40.515,64.54,'chill'],[40.522,64.541,'chill'],[40.53,64.545,'chill'],
  [40.51,64.55,'joy'],[40.502,64.553,'joy'],[40.498,64.548,'joy'],
  [40.535,64.553,'move'],[40.54,64.558,'move'],[40.546,64.552,'move'],
  [40.49,64.535,'blue'],[40.497,64.532,'blue'],[40.505,64.531,'blue'],
  [40.55,64.538,'chaos'],[40.557,64.541,'chaos'],
].map(([lng,lat,vibe],i)=>({type:'Feature',id:i,properties:{vibe,weight:1},geometry:{type:'Point',coordinates:[lng,lat]}}))

const featureCollection = features => ({ type:'FeatureCollection', features })

// Snap a private location to an approximately 300 m public grid cell.
// The exact browser coordinates stay only in userLocation and are never added to the heatmap.
function snapToGrid([lng, lat], cellMeters = 300) {
  const latStep = cellMeters / 111320
  const lngStep = cellMeters / (111320 * Math.cos(lat * Math.PI / 180))
  return [
    Math.round(lng / lngStep) * lngStep,
    Math.round(lat / latStep) * latStep,
  ]
}

const ACTIVE_VIBE_KEY='vibemap-active-vibe'
const DEVICE_KEY='vibemap-device-id'
const API_URL=import.meta.env.VITE_API_URL || 'http://95.53.14.84:8787'
function getDeviceId(){
  let id=localStorage.getItem(DEVICE_KEY)
  if(!id){ id=crypto.randomUUID(); localStorage.setItem(DEVICE_KEY,id) }
  return id
}

// Stable privacy-preserving offset inside the public grid cell.
// The same browser gets the same spot, so the cloud does not jump on refresh.
function offsetInsideCell(cell, deviceId, cellMeters=300){
  let hash=2166136261
  for(const ch of deviceId){ hash^=ch.charCodeAt(0); hash=Math.imul(hash,16777619) }
  const rand=n=>{ const x=Math.sin((hash+n)*12.9898)*43758.5453; return x-Math.floor(x) }
  const angle=rand(1)*Math.PI*2
  const radius=Math.sqrt(rand(2))*cellMeters*.36
  const lat=cell[1]
  const dLat=(Math.sin(angle)*radius)/111320
  const dLng=(Math.cos(angle)*radius)/(111320*Math.cos(lat*Math.PI/180))
  return [cell[0]+dLng,cell[1]+dLat]
}
const VIBE_TTL_MS=2*60*60*1000

function loadActiveVibe(){
  try{
    const saved=JSON.parse(localStorage.getItem(ACTIVE_VIBE_KEY)||'null')
    if(!saved || Date.now()-saved.updatedAt>VIBE_TTL_MS){
      localStorage.removeItem(ACTIVE_VIBE_KEY)
      return null
    }
    return saved
  }catch{return null}
}

function App(){
  const mapEl=useRef(null)
  const mapRef=useRef(null)
  const [sheetOpen,setSheetOpen]=useState(true)
  const [activeVibe,setActiveVibe]=useState(()=>loadActiveVibe())
  const [selected,setSelected]=useState(()=>loadActiveVibe()?.vibe||null)
  const [count,setCount]=useState(128)
  const [status,setStatus]=useState('Определяем район…')
  const userLocation=useRef(null)
  const [features,setFeatures]=useState([])

  const refreshVibes=()=>{
    fetch(API_URL+'/api/vibes')
      .then(r=>r.ok?r.json():Promise.reject())
      .then(data=>{
        const remote=(data.cells||[]).map((x,i)=>({
          type:'Feature',
          id:'remote-'+i,
          properties:{vibe:x.vibe,weight:Number(x.weight)||1},
          geometry:{type:'Point',coordinates:[Number(x.lng),Number(x.lat)]}
        }))
        setFeatures(remote)
        setCount(data.total||0)
      })
      .catch(()=>{})
  }

  useEffect(()=>{
    refreshVibes()
    const timer=setInterval(refreshVibes,3000)
    return()=>clearInterval(timer)
  },[])

  const dominant=useMemo(()=>{
    const counts={}
    features.forEach(f=>counts[f.properties.vibe]=(counts[f.properties.vibe]||0)+1)
    const id=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'chill'
    return VIBES.find(v=>v.id===id)||VIBES[2]
  },[features])

  useEffect(()=>{
    const map=new maplibregl.Map({
      container:mapEl.current,
      style:MAP_STYLE,
      center:[40.515,64.54],
      zoom:13.6,
      minZoom:10,
      maxZoom:18.5,
      attributionControl:true,
    })
    mapRef.current=map
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right')

    map.on('load',()=>{
      makeMapVibey(map)
      map.addSource('vibes',{type:'geojson',data:featureCollection([])})
      refreshVibes()
      VIBES.forEach(v=>map.addLayer({
        id:'heat-'+v.id,type:'heatmap',source:'vibes',
        filter:['==',['get','vibe'],v.id],
        paint:{
          'heatmap-weight':['interpolate',['linear'],['get','weight'],1,1,10,2.4],
          'heatmap-intensity':['interpolate',['linear'],['zoom'],10,1.35,16,2.8],
          'heatmap-radius':['interpolate',['linear'],['zoom'],10,36,16,68],
          'heatmap-opacity':['interpolate',['linear'],['zoom'],10,.96,17,.78],
          'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',.12,v.color+'22',.32,v.color+'77',.58,v.color+'cc',.82,v.color,1,v.color]
        }
      }))

      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(pos=>{
          const {longitude,latitude}=pos.coords
          userLocation.current=[longitude,latitude]
          setStatus('Твоя точка найдена')
          map.easeTo({center:[longitude,latitude],zoom:15,duration:900})
          new maplibregl.Marker({color:'#ffffff',scale:.65}).setLngLat([longitude,latitude]).addTo(map)
        },()=>setStatus('Показываем демо-район'),{enableHighAccuracy:true,timeout:7000})
      } else setStatus('Показываем демо-район')
    })
    map.on('dragstart',()=>setSheetOpen(false))
    map.on('zoomstart',()=>setSheetOpen(false))
    return()=>map.remove()
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(map?.getSource('vibes')) map.getSource('vibes').setData(featureCollection(features))
  },[features])

  const chooseVibe=vibe=>{
    if (!userLocation.current) {
      setStatus('Нужна геопозиция, чтобы отметить вайб')
      navigator.geolocation?.getCurrentPosition(pos=>{
        const exact=[pos.coords.longitude,pos.coords.latitude]
        userLocation.current=exact
        setStatus('Твоя точка найдена')
        addVibeToGrid(vibe, exact)
      },()=>setStatus('Не удалось получить геопозицию'),{enableHighAccuracy:true,timeout:7000})
      return
    }
    addVibeToGrid(vibe, userLocation.current)
  }

  const addVibeToGrid=(vibe, exactLocation)=>{
    const publicCell=snapToGrid(exactLocation,300)
    const publicPoint=offsetInsideCell(publicCell,getDeviceId(),300)
    const previous=activeVibe
    const next={vibe:vibe.id,cell:publicPoint,updatedAt:Date.now()}
    localStorage.setItem(ACTIVE_VIBE_KEY,JSON.stringify(next))
    fetch(API_URL+'/api/vibes/'+getDeviceId(),{
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({vibe:vibe.id,lng:publicPoint[0],lat:publicPoint[1]})
    }).catch(()=>{})
    setActiveVibe(next)
    setSelected(vibe.id)

    // One browser = one active vote. Changing mood replaces the previous vote.
    // Optimistic local replacement; the server remains the source of truth.
    setFeatures(prev=>[
      ...prev.filter(feature=>feature.properties?.deviceLocal!==true),
      {
        type:'Feature',
        properties:{vibe:vibe.id,weight:1,deviceLocal:true},
        geometry:{type:'Point',coordinates:publicPoint}
      }
    ])
    setTimeout(()=>{
      fetch(API_URL+'/api/vibes').then(r=>r.json()).then(data=>{
        const remote=(data.cells||[]).map((x,i)=>({
          type:'Feature',id:'remote-'+i,properties:{vibe:x.vibe,weight:x.weight},
          geometry:{type:'Point',coordinates:[Number(x.lng),Number(x.lat)]}
        }))
        setFeatures(remote)
        setCount(data.total||0)
      }).catch(()=>{})
    },250)
    if(!previous) setCount(c=>c+1)
    setStatus(previous?.vibe===vibe.id?'Вайб обновлён':'Твой актуальный вайб отмечен')
    setTimeout(()=>setSheetOpen(false),260)
  }

  return <main className="app">
    <section className="topbar"><div><h1 className="brand">вайбмэп</h1><p className="sub">{status} · {count} отметок за 2 часа</p></div></section>
    <section className="map-shell">
      <div ref={mapEl} className="map"/>
      <button className="locate" onClick={()=>{const p=userLocation.current;if(p) mapRef.current?.easeTo({center:p,zoom:15,duration:700});else navigator.geolocation?.getCurrentPosition(pos=>{const p=[pos.coords.longitude,pos.coords.latitude];userLocation.current=p;mapRef.current?.easeTo({center:p,zoom:15,duration:700})})}} aria-label="Найти меня">◎</button>
      {!sheetOpen&&<button className="reopen" onClick={()=>setSheetOpen(true)}>✦ Отметить свой вайб</button>}
      <section className={'sheet '+(sheetOpen?'open':'closed')} aria-hidden={!sheetOpen}>
        <button className="handle" onClick={()=>setSheetOpen(false)} aria-label="Свернуть панель"><span/></button>
        <div className="sheet-content">
          <div className="sheet-head"><h2>Какой у тебя сейчас вайб?</h2><p>Один человек — один актуальный вайб. Можно менять настроение.</p></div>
          <div className="vibes">{VIBES.map(v=><button key={v.id} className={'vibe '+(selected===v.id?'active':'')} onClick={()=>chooseVibe(v)}><span className="icon">{v.icon}</span><span>{v.label}</span></button>)}</div>
          <p className="privacy">Вайб живёт 2 часа. Новая отметка заменяет предыдущую, точная геопозиция не публикуется.</p>
        </div>
      </section>
    </section>
  </main>
}
createRoot(document.getElementById('root')).render(<App />)