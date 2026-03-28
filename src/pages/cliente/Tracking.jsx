import { useState, useEffect, useRef, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { formatPrice } from '../../lib/pricing'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

const MAP_STYLES = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
]

// Fases de búsqueda estilo Uber — cada 30s el radio se expande
const SEARCH_PHASES = [
  { km: 0.3,  display: '300 m',    label: 'Buscando paseadores cercanos' },
  { km: 0.6,  display: '600 m',    label: 'Ampliando búsqueda' },
  { km: 1.0,  display: '1 km',     label: 'Ampliando búsqueda' },
  { km: 2.0,  display: '2 km',     label: 'Buscando más lejos' },
  { km: 5.0,  display: '5 km',     label: 'Búsqueda en toda la zona' },
  { km: null, display: 'Sin límite', label: 'Búsqueda máxima activa' },
]

const PAYMENT_ICONS = { efectivo: '💵', transferencia: '🏦', tarjeta: '💳' }

export default function Tracking() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [walk, setWalk] = useState(null)
  const [walker, setWalker] = useState(null)
  const [walkerPos, setWalkerPos] = useState(null)
  const [directions, setDirections] = useState(null)
  const [eta, setEta] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [phaseIndex, setPhaseIndex] = useState(0)

  const mapRef = useRef(null)
  const timerRef = useRef(null)
  const phaseTimerRef = useRef(null)
  const channelsRef = useRef([])
  const walkRef = useRef(null)
  const phaseIndexRef = useRef(0)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
  })

  useEffect(() => {
    fetchActiveWalk()
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (phaseTimerRef.current) clearInterval(phaseTimerRef.current)
      channelsRef.current.forEach(ch => supabase.removeChannel(ch))
    }
  }, [])

  // Expansión de radio cuando está pending
  useEffect(() => {
    if (walk?.status !== 'pending') {
      if (phaseTimerRef.current) { clearInterval(phaseTimerRef.current); phaseTimerRef.current = null }
      return
    }

    phaseIndexRef.current = 0
    setPhaseIndex(0)

    phaseTimerRef.current = setInterval(async () => {
      const next = phaseIndexRef.current + 1
      if (next >= SEARCH_PHASES.length) return
      phaseIndexRef.current = next
      setPhaseIndex(next)

      const newRadius = SEARCH_PHASES[next].km
      if (walkRef.current?.id) {
        await supabase
          .from('walk_requests')
          .update({ search_radius_km: newRadius })
          .eq('id', walkRef.current.id)
      }
    }, 30000)

    return () => { if (phaseTimerRef.current) clearInterval(phaseTimerRef.current) }
  }, [walk?.status])

  // Pide la ruta cuando está accepted; la limpia cuando inicia o termina
  useEffect(() => {
    if (!isLoaded) return
    if (walk?.status !== 'accepted') {
      setDirections(null)
      setEta(null)
      return
    }
    if (!walkerPos || !walk?.pickup_lat || !walk?.pickup_lng) return

    const service = new window.google.maps.DirectionsService()
    service.route(
      {
        origin: walkerPos,
        destination: { lat: walk.pickup_lat, lng: walk.pickup_lng },
        travelMode: window.google.maps.TravelMode.WALKING,
      },
      (result, status) => {
        if (status === 'OK') {
          setDirections(result)
          const leg = result.routes[0]?.legs[0]
          if (leg?.duration) setEta(leg.duration.text)
          if (mapRef.current && result.routes[0]?.bounds) {
            mapRef.current.fitBounds(result.routes[0].bounds, 60)
          }
        }
      }
    )
  }, [walkerPos, isLoaded, walk?.status])

  async function fetchActiveWalk() {
    const { data: walkData } = await supabase
      .from('walk_requests')
      .select('*')
      .eq('cliente_id', profile.id)
      .in('status', ['pending', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!walkData) { setLoading(false); return }

    setWalk(walkData)
    walkRef.current = walkData

    const walkChannel = supabase
      .channel(`walk-status-${walkData.id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'walk_requests',
        filter: `id=eq.${walkData.id}`,
      }, (payload) => {
        console.log('[Realtime] walk UPDATE', payload.new?.status)
        setWalk(payload.new)
        walkRef.current = payload.new
        if (payload.new.status === 'in_progress') startTimer()
        if (payload.new.status === 'accepted') fetchWalker(walkData.id)
        if (payload.new.status === 'completed' || payload.new.status === 'cancelled') {
          navigate('/cliente')
        }
      })
      .subscribe((status, err) => {
        if (err) console.error('[Realtime] walk channel error:', err)
        console.log('[Realtime] walk channel:', status)
      })
    channelsRef.current.push(walkChannel)

    if (walkData.status !== 'pending') {
      await fetchWalker(walkData.id)
    }
    if (walkData.status === 'in_progress') startTimer()
    setLoading(false)
  }

  async function fetchWalker(requestId) {
    const { data: assignment } = await supabase
      .from('walk_assignments')
      .select('paseador_id')
      .eq('request_id', requestId)
      .maybeSingle()

    if (!assignment?.paseador_id) return

    const { data: walkerData } = await supabase
      .from('paseadores')
      .select('*')
      .eq('id', assignment.paseador_id)
      .single()

    if (!walkerData) return
    setWalker(walkerData)
    if (walkerData.current_lat && walkerData.current_lng) {
      setWalkerPos({ lat: walkerData.current_lat, lng: walkerData.current_lng })
    }

    const locChannel = supabase
      .channel(`walker-loc-${assignment.paseador_id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'paseadores',
        filter: `id=eq.${assignment.paseador_id}`,
      }, (payload) => {
        const { current_lat, current_lng } = payload.new
        if (current_lat && current_lng) setWalkerPos({ lat: current_lat, lng: current_lng })
      })
      .subscribe((status, err) => {
        if (err) console.error('[Realtime] walker loc error:', err)
      })
    channelsRef.current.push(locChannel)
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

  async function cancelWalk() {
    if (!walk) return
    await supabase.from('walk_requests').update({ status: 'cancelled' }).eq('id', walk.id)
    navigate('/cliente')
  }

  const onMapLoad = useCallback((map) => { mapRef.current = map }, [])

  if (loading) {
    return (
      <div className="loading-screen" style={{ height: 'auto', padding: 60 }}>
        <span className="loading-logo">📍</span>
        <p>Cargando seguimiento...</p>
      </div>
    )
  }

  if (!walk) {
    return (
      <EmptyState
        icon="📍"
        title="Sin paseo activo"
        message="Solicitá un paseo para ver el seguimiento acá"
      />
    )
  }

  // ── PANTALLA PENDING: radar estilo Uber ──────────────────────
  if (walk.status === 'pending') {
    const phase = SEARCH_PHASES[phaseIndex]
    return (
      <div className="tracking-uber-wrapper">
        <div className="uber-search-bg" />

        <div className="uber-search-content">
          {/* Radar */}
          <div className="radar-wrapper">
            <div className="radar-ring r1" />
            <div className="radar-ring r2" />
            <div className="radar-ring r3" />
            <div className="radar-center">🐕</div>
          </div>

          {/* Info de fase */}
          <div className="search-phase-block">
            <h3 className="search-phase-title">{phase.label}...</h3>
            <div className="search-radius-badge">
              📡 Radio: <strong>{phase.display}</strong>
            </div>
          </div>

          {/* Barra de progreso — se reinicia con cada fase */}
          <div className="search-progress-track" key={phaseIndex}>
            <div className="search-progress-fill" />
          </div>

          {/* Indicadores de fase */}
          <div className="search-phase-dots">
            {SEARCH_PHASES.map((_, i) => (
              <span
                key={i}
                className={`phase-dot ${i <= phaseIndex ? 'active' : ''} ${i === phaseIndex ? 'current' : ''}`}
              />
            ))}
          </div>

          {/* Info del walk */}
          <div className="search-walk-info">
            {walk.payment_method && (
              <span className="search-info-chip">
                {PAYMENT_ICONS[walk.payment_method]} {walk.payment_method.charAt(0).toUpperCase() + walk.payment_method.slice(1)}
              </span>
            )}
            <span className="search-info-chip">{walk.duration_minutes} min</span>
            <span className="search-info-chip">{formatPrice(walk.total_price)}</span>
          </div>

          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={cancelWalk}>
            Cancelar búsqueda
          </button>
        </div>
      </div>
    )
  }

  // ── PANTALLA ACCEPTED / IN_PROGRESS: mapa estilo Uber ────────
  const pickupPos = walk.pickup_lat && walk.pickup_lng
    ? { lat: walk.pickup_lat, lng: walk.pickup_lng }
    : null
  const mapCenter = walkerPos || pickupPos || BUENOS_AIRES

  return (
    <div className="tracking-uber-wrapper">
      {isLoaded ? (
        <GoogleMap
          mapContainerClassName="tracking-uber-map"
          center={mapCenter}
          zoom={15}
          onLoad={onMapLoad}
          options={{ styles: MAP_STYLES, disableDefaultUI: true, zoomControl: true, zoomControlOptions: { position: 3 } }}
        >
          {pickupPos && (
            <Marker position={pickupPos} icon={{ path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z', fillColor: '#3B82F6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 2, anchor: { x: 12, y: 24 } }} />
          )}
          {walkerPos && (
            <Marker position={walkerPos} icon={{ path: 0, fillColor: '#2ECC71', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 11 }} />
          )}
          {directions && (
            <DirectionsRenderer directions={directions} options={{ suppressMarkers: true, polylineOptions: { strokeColor: '#2ECC71', strokeWeight: 5, strokeOpacity: 0.85 } }} />
          )}
        </GoogleMap>
      ) : (
        <div className="tracking-uber-map" style={{ background: '#e5e7eb' }} />
      )}

      {/* Banner superior */}
      <div className="tracking-top-bar">
        {walk.status === 'accepted' && (
          <div className="tracking-status-banner accepted">
            <span className="tracking-status-icon">🐾</span>
            <div>
              <div className="tracking-status-title">Paseador en camino</div>
              {eta && <div className="tracking-eta">Llega en aprox. {eta}</div>}
            </div>
          </div>
        )}
        {walk.status === 'in_progress' && (
          <div className="tracking-status-banner in-progress">
            <span className="tracking-status-icon">🦮</span>
            <div>
              <div className="tracking-status-title">Paseo en curso</div>
              <div className="tracking-timer-inline">⏱️ {formatTime(elapsed)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <div className="tracking-bottom-sheet">
        {(walkerPos || pickupPos) && (
          <div className="tracking-legend">
            {walkerPos && <div className="legend-item"><span className="legend-dot green" /><span>{walk.status === 'in_progress' ? 'Tu perro' : 'Paseador'}</span></div>}
            {pickupPos && <div className="legend-item"><span className="legend-dot blue" /><span>Tu dirección</span></div>}
          </div>
        )}
        {walker && (
          <div className="walker-info-row">
            <div className="walker-avatar-circle">🐾</div>
            <div className="walker-info-text">
              <div className="walker-info-name">{walker.full_name}</div>
              {walker.phone && <div className="walker-info-phone">{walker.phone}</div>}
            </div>
            <StatusBadge status={walk.status} />
          </div>
        )}
        <div className="tracking-chips">
          <span className="tracking-chip">{walk.duration_minutes} min</span>
          <span className="tracking-chip">{formatPrice(walk.total_price)}</span>
          {walk.payment_method && (
            <span className="tracking-chip">
              {PAYMENT_ICONS[walk.payment_method]} {walk.payment_method}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
