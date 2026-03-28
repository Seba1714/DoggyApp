import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { formatPrice } from '../../lib/pricing'
import toast from 'react-hot-toast'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

const MAP_STYLES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

export default function ActiveWalk() {
  const { profile } = useAuth()
  const [walk, setWalk] = useState(null)
  const [dog, setDog] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [myPos, setMyPos] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)
  const watchRef = useRef(null)
  const mapRef = useRef(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
  })

  useEffect(() => {
    fetchActiveWalk()
    startLocationWatch()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
    }
  }, [])

  // Continúa actualizando la ubicación del paseador en la DB
  function startLocationWatch() {
    if (!navigator.geolocation) return
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setMyPos({ lat: latitude, lng: longitude })
        await supabase
          .from('paseadores')
          .update({ current_lat: latitude, current_lng: longitude })
          .eq('id', profile.id)
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  async function fetchActiveWalk() {
    const { data: assignments } = await supabase
      .from('walk_assignments')
      .select('request_id')
      .eq('paseador_id', profile.id)
      .order('accepted_at', { ascending: false })
      .limit(1)

    if (!assignments?.length) { setLoading(false); return }

    const { data: walkData } = await supabase
      .from('walk_requests')
      .select('*')
      .eq('id', assignments[0].request_id)
      .in('status', ['accepted', 'in_progress'])
      .maybeSingle()

    if (!walkData) { setLoading(false); return }
    setWalk(walkData)

    const [{ data: dogData }, { data: clienteData }] = await Promise.all([
      supabase.from('dogs').select('*').eq('id', walkData.dog_id).single(),
      supabase.from('clientes').select('*').eq('id', walkData.cliente_id).single(),
    ])

    setDog(dogData)
    setCliente(clienteData)
    if (walkData.status === 'in_progress') startTimer()
    setLoading(false)
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  async function startWalk() {
    const { error } = await supabase
      .from('walk_requests')
      .update({ status: 'in_progress' })
      .eq('id', walk.id)
    if (error) { toast.error('Error al iniciar'); return }
    setWalk(w => ({ ...w, status: 'in_progress' }))
    startTimer()
    toast.success('Paseo iniciado!')
  }

  async function finishWalk() {
    const { error } = await supabase
      .from('walk_requests')
      .update({ status: 'completed' })
      .eq('id', walk.id)
    if (error) { toast.error('Error al finalizar'); return }
    if (timerRef.current) clearInterval(timerRef.current)
    setWalk(null)
    toast.success('Paseo completado!')
  }

  const onMapLoad = useCallback((map) => { mapRef.current = map }, [])

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: 'auto', padding: 60 }}>
        <span className="loading-logo">🦮</span>
        <p>Cargando paseo...</p>
      </div>
    )
  }

  if (!walk) {
    return (
      <EmptyState
        icon="🦮"
        title="Sin paseo activo"
        message="Aceptá una solicitud desde el mapa para empezar"
      />
    )
  }

  const pickupPos = walk.pickup_lat && walk.pickup_lng
    ? { lat: walk.pickup_lat, lng: walk.pickup_lng }
    : null

  const mapCenter = myPos || pickupPos || BUENOS_AIRES

  return (
    <div className="active-walk-page">
      {/* Mapa full-width con posición del paseador */}
      {isLoaded && (
        <div className="active-walk-map-container">
          <GoogleMap
            mapContainerStyle={{ width: '100%', height: '100%' }}
            center={mapCenter}
            zoom={16}
            onLoad={onMapLoad}
            options={{
              styles: MAP_STYLES,
              disableDefaultUI: true,
              zoomControl: true,
              zoomControlOptions: { position: 3 },
            }}
          >
            {/* Pin del punto de recogida */}
            {pickupPos && (
              <Marker
                position={pickupPos}
                icon={{
                  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
                  fillColor: '#3B82F6',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                  scale: 2,
                  anchor: { x: 12, y: 24 },
                }}
              />
            )}

            {/* Punto verde — mi posición actual (paseador) */}
            {myPos && (
              <Marker
                position={myPos}
                icon={{
                  path: 0,
                  fillColor: '#2ECC71',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 3,
                  scale: 11,
                }}
              />
            )}
          </GoogleMap>

          {/* Leyenda superpuesta */}
          <div className="active-walk-map-legend">
            {myPos && (
              <div className="legend-item">
                <span className="legend-dot green" />
                <span>Mi posición</span>
              </div>
            )}
            {pickupPos && (
              <div className="legend-item">
                <span className="legend-dot blue" />
                <span>Punto de recogida</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Timer cuando está en curso */}
      {walk.status === 'in_progress' && (
        <div className="timer">⏱️ {formatTime(elapsed)}</div>
      )}

      {/* Detalles del paseo */}
      <div className="walk-detail-card">
        <div className="walk-detail-row">
          <span className="walk-detail-label">Estado</span>
          <StatusBadge status={walk.status} />
        </div>
        <div className="walk-detail-row">
          <span className="walk-detail-label">Dirección</span>
          <span className="walk-detail-value" style={{ fontSize: 12, textAlign: 'right', maxWidth: '60%' }}>
            {walk.address || 'Sin dirección'}
          </span>
        </div>
        {dog && (
          <div className="walk-detail-row">
            <span className="walk-detail-label">Perro</span>
            <span className="walk-detail-value">{dog.name} ({dog.size})</span>
          </div>
        )}
        {cliente && (
          <div className="walk-detail-row">
            <span className="walk-detail-label">Cliente</span>
            <span className="walk-detail-value">{cliente.full_name}</span>
          </div>
        )}
        {cliente?.phone && (
          <div className="walk-detail-row">
            <span className="walk-detail-label">Teléfono</span>
            <span className="walk-detail-value">{cliente.phone}</span>
          </div>
        )}
        <div className="walk-detail-row">
          <span className="walk-detail-label">Duración</span>
          <span className="walk-detail-value">{walk.duration_minutes} min</span>
        </div>
        <div className="walk-detail-row">
          <span className="walk-detail-label">Total</span>
          <span className="walk-detail-value" style={{ color: 'var(--primary-dark)' }}>
            {formatPrice(walk.total_price)}
          </span>
        </div>
      </div>

      {/* Acciones */}
      <div style={{ marginTop: 16, paddingBottom: 16 }}>
        {walk.status === 'accepted' && (
          <button className="btn btn-primary btn-lg" onClick={startWalk}>
            🦮 Iniciar paseo
          </button>
        )}
        {walk.status === 'in_progress' && (
          <button className="btn btn-danger btn-lg" onClick={finishWalk}>
            ✅ Finalizar paseo
          </button>
        )}
      </div>
    </div>
  )
}
