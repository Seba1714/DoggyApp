import { useState, useEffect, useCallback, useRef } from 'react'
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { haversineKm } from '../../lib/geo'
import { calculatePrice, formatPrice } from '../../lib/pricing'
import { DARK_MAP_STYLE } from '../../lib/paseadorTheme'
import toast from 'react-hot-toast'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }
const PAYMENT_ICONS = { efectivo: '💵', transferencia: '🏦', tarjeta: '💳' }

function consentKey(id) { return `doggy_loc_${id}` }
function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}
function formatSeconds(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = (s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

export default function PaseadorHome() {
  const { profile } = useAuth()

  // Location
  const [myPos, setMyPos] = useState(null)
  const [geoStatus, setGeoStatus] = useState('loading')
  const [showConsent, setShowConsent] = useState(false)

  // Pending requests
  const [requests, setRequests] = useState([])
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [accepting, setAccepting] = useState(false)

  // Active walks (accepted + in_progress)
  const [activeWalks, setActiveWalks] = useState([])
  const [walkTimers, setWalkTimers] = useState({})   // walkId -> { remaining }
  const [expandedWalk, setExpandedWalk] = useState(null)
  const [finishing, setFinishing] = useState({})     // walkId -> bool
  const [starting, setStarting] = useState({})       // walkId -> bool

  // Stats
  const [todayEarnings, setTodayEarnings] = useState(0)
  const [totalWalks, setTotalWalks] = useState(0)

  // Refs
  const watchRef = useRef(null)
  const refreshRef = useRef(null)
  const timerRef = useRef(null)
  const mapRef = useRef(null)
  const warnedRef = useRef(new Set())
  // Unique channel ID per mount (avoids StrictMode double-mount zombie channels)
  const channelIdRef = useRef(`paseador-home-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  // Refs to always-fresh callbacks for Realtime closures
  const fetchRequestsRef = useRef(null)
  const fetchActiveWalksRef = useRef(null)
  const fetchStatsRef = useRef(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
  })

  // ── Init ──────────────────────────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(consentKey(profile.id))
    if (stored === 'granted') {
      startLocationWatch()
    } else if (!stored) {
      setShowConsent(true)
      setGeoStatus('denied')
    } else {
      setGeoStatus('denied')
    }

    // Carga inicial
    fetchRequestsRef.current()
    fetchActiveWalksRef.current()
    fetchStatsRef.current()

    // Polling de 5 s como red de seguridad (Realtime es el canal principal)
    refreshRef.current = setInterval(() => {
      fetchRequestsRef.current?.()
      fetchActiveWalksRef.current?.()
    }, 5000)

    // ── WebSocket Realtime ──────────────────────────────────────
    const channel = supabase
      .channel(channelIdRef.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'walk_requests' },
        (payload) => {
          console.log('[Realtime] INSERT walk_request', payload.new?.id)
          fetchRequestsRef.current?.()
          toast('¡Nueva solicitud de paseo!', { icon: '🐕' })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'walk_requests' },
        (payload) => {
          console.log('[Realtime] UPDATE walk_request', payload.new?.id, payload.new?.status)
          fetchRequestsRef.current?.()
          fetchActiveWalksRef.current?.()
          fetchStatsRef.current?.()
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('[Realtime] error:', err)
        console.log('[Realtime] channel status:', status)
      })

    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
      if (refreshRef.current) clearInterval(refreshRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [])

  // ── Timer for active walks ────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)

    const inProgress = activeWalks.filter(w => w.status === 'in_progress' && w.started_at)
    if (!inProgress.length) return

    timerRef.current = setInterval(() => {
      const now = Date.now()
      const newTimers = {}
      const toWarn = []

      inProgress.forEach(aw => {
        const elapsed = Math.floor((now - new Date(aw.started_at).getTime()) / 1000)
        const total = aw.duration_minutes * 60
        const remaining = Math.max(0, total - elapsed)
        newTimers[aw.id] = { remaining, elapsed }

        if (remaining <= 300 && remaining > 0 && !warnedRef.current.has(aw.id)) {
          warnedRef.current.add(aw.id)
          toWarn.push(aw)
        }
      })

      setWalkTimers(prev => ({ ...prev, ...newTimers }))

      toWarn.forEach(aw => {
        toast(`⚠️ Quedan 5 min — devolvé a ${aw.dog?.name || 'la mascota'}`, {
          duration: 12000,
          icon: '🚨',
          style: { background: '#FF3B30', color: '#fff', fontWeight: '600', fontSize: '14px' },
        })
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [activeWalks])

  // ── Location ──────────────────────────────────────────────────
  function startLocationWatch() {
    if (!navigator.geolocation) { setGeoStatus('denied'); return }
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        setMyPos({ lat: latitude, lng: longitude })
        setGeoStatus('sharing')
        await supabase.from('paseadores').update({ current_lat: latitude, current_lng: longitude }).eq('id', profile.id)
      },
      () => setGeoStatus('denied'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
  }

  function handleConsentGrant() {
    localStorage.setItem(consentKey(profile.id), 'granted')
    setShowConsent(false)
    startLocationWatch()
    toast.success('Ubicación activada')
  }

  function handleConsentDeny() {
    localStorage.setItem(consentKey(profile.id), 'denied')
    setShowConsent(false)
    setGeoStatus('denied')
  }

  // ── Stats ─────────────────────────────────────────────────────
  async function fetchStats() {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data: assignments } = await supabase
      .from('walk_assignments').select('request_id').eq('paseador_id', profile.id)
    setTotalWalks(assignments?.length || 0)
    if (assignments?.length) {
      const ids = assignments.map(a => a.request_id)
      const { data: walks } = await supabase
        .from('walk_requests').select('total_price').in('id', ids)
        .eq('status', 'completed').gte('created_at', today.toISOString())
      setTodayEarnings(walks?.reduce((s, w) => s + Number(w.total_price || 0), 0) || 0)
    }
  }

  // ── Pending requests ──────────────────────────────────────────
  const fetchRequests = useCallback(async () => {
    const { data: myData } = await supabase
      .from('paseadores').select('current_lat, current_lng, payment_methods')
      .eq('id', profile.id).single()

    const { data, error } = await supabase
      .from('walk_requests').select('*').eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error || !data) return

    const dogIds = [...new Set(data.map(r => r.dog_id).filter(Boolean))]
    let dogsMap = {}
    if (dogIds.length) {
      const { data: dd } = await supabase.from('dogs').select('id, name, size, breed').in('id', dogIds)
      if (dd) dd.forEach(d => { dogsMap[d.id] = d })
    }

    const myPaymentMethods = myData?.payment_methods || {}
    const hasAnyMethod = Object.values(myPaymentMethods).some(m => m?.enabled)

    const enriched = data
      .map(r => {
        let distanceKm = null, recalcPrice = Number(r.total_price)
        if (myData?.current_lat && myData?.current_lng && r.pickup_lat && r.pickup_lng) {
          distanceKm = haversineKm(myData.current_lat, myData.current_lng, r.pickup_lat, r.pickup_lng)
          recalcPrice = calculatePrice(r.duration_minutes, myData.current_lat, myData.current_lng, r.pickup_lat, r.pickup_lng).totalPrice
        }
        return { ...r, dogs: dogsMap[r.dog_id] || null, distanceFromWalker: distanceKm, recalcPrice }
      })
      .filter(r => {
        if (!r.payment_method) return true
        if (!hasAnyMethod) return true
        return myPaymentMethods[r.payment_method]?.enabled === true
      })
      .sort((a, b) => (a.distanceFromWalker ?? Infinity) - (b.distanceFromWalker ?? Infinity))

    setRequests(enriched)
  }, [profile.id])

  // ── Active walks ──────────────────────────────────────────────
  const fetchActiveWalks = useCallback(async () => {
    const { data: assignments } = await supabase
      .from('walk_assignments').select('request_id').eq('paseador_id', profile.id)
    if (!assignments?.length) { setActiveWalks([]); return }

    const requestIds = assignments.map(a => a.request_id)
    const { data: walks } = await supabase
      .from('walk_requests').select('*').in('id', requestIds)
      .in('status', ['accepted', 'in_progress'])

    if (!walks?.length) { setActiveWalks([]); return }

    const dogIds = [...new Set(walks.map(w => w.dog_id).filter(Boolean))]
    const clienteIds = [...new Set(walks.map(w => w.cliente_id).filter(Boolean))]

    const [dogsRes, clientesRes] = await Promise.all([
      dogIds.length ? supabase.from('dogs').select('id, name, size').in('id', dogIds) : Promise.resolve({ data: [] }),
      clienteIds.length ? supabase.from('clientes').select('id, full_name, phone').in('id', clienteIds) : Promise.resolve({ data: [] }),
    ])

    const dogsMap = Object.fromEntries((dogsRes.data || []).map(d => [d.id, d]))
    const clientesMap = Object.fromEntries((clientesRes.data || []).map(c => [c.id, c]))

    setActiveWalks(walks.map(w => ({
      ...w,
      dog: dogsMap[w.dog_id] || null,
      cliente: clientesMap[w.cliente_id] || null,
    })))
  }, [profile.id])

  // ── Accept / start / finish ───────────────────────────────────
  async function acceptRequest(req) {
    setAccepting(true)
    try {
      const { error: e1 } = await supabase
        .from('walk_requests')
        .update({ status: 'accepted' })
        .eq('id', req.id)
      if (e1) {
        console.error('[acceptRequest] update error:', e1)
        toast.error('Error al aceptar: ' + e1.message)
        return
      }

      const { error: e2 } = await supabase
        .from('walk_assignments')
        .insert({ request_id: req.id, paseador_id: profile.id })
      if (e2) {
        console.error('[acceptRequest] insert error:', e2)
        // Si ya existe la asignación (otro paseador aceptó antes) revertir
        if (e2.code === '23505') {
          toast.error('Este paseo ya fue tomado por otro paseador')
          await supabase.from('walk_requests').update({ status: 'pending' }).eq('id', req.id)
        } else {
          toast.error('Error al asignar: ' + e2.message)
        }
        return
      }

      toast.success('¡Paseo aceptado! 🐾')
      setSelectedRequest(null)
      setRequests(prev => prev.filter(r => r.id !== req.id))
      fetchActiveWalks()
    } catch (err) {
      console.error('[acceptRequest] exception:', err)
      toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
    } finally {
      setAccepting(false)
    }
  }

  async function startWalk(walkId) {
    setStarting(p => ({ ...p, [walkId]: true }))
    try {
      const { error } = await supabase.from('walk_requests')
        .update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', walkId)
      if (error) { toast.error('Error al iniciar: ' + error.message); return }
      toast.success('Paseo iniciado!')
      fetchActiveWalks()
    } catch (err) {
      console.error('[startWalk] exception:', err)
      toast.error('Error inesperado')
    } finally {
      setStarting(p => ({ ...p, [walkId]: false }))
    }
  }

  async function finishWalk(walkId) {
    setFinishing(p => ({ ...p, [walkId]: true }))
    try {
      const { error } = await supabase.from('walk_requests').update({ status: 'completed' }).eq('id', walkId)
      if (error) { toast.error('Error al finalizar: ' + error.message); return }
      toast.success('Paseo completado! 🎉')
      warnedRef.current.delete(walkId)
      if (expandedWalk === walkId) setExpandedWalk(null)
      fetchActiveWalks()
      fetchStats()
    } catch (err) {
      console.error('[finishWalk] exception:', err)
      toast.error('Error inesperado')
    } finally {
      setFinishing(p => ({ ...p, [walkId]: false }))
    }
  }

  function dismissRequest(reqId) {
    setRequests(prev => prev.filter(r => r.id !== reqId))
    if (selectedRequest?.id === reqId) setSelectedRequest(null)
  }

  // Mantener refs frescos para que los callbacks de Realtime/setInterval
  // siempre llamen la versión más nueva de cada función
  fetchRequestsRef.current = fetchRequests
  fetchActiveWalksRef.current = fetchActiveWalks
  fetchStatsRef.current = fetchStats

  const onMapLoad = useCallback((map) => { mapRef.current = map }, [])
  const center = myPos || BUENOS_AIRES
  const isOnline = geoStatus === 'sharing'

  // ── Active walk card render helper ────────────────────────────
  function ActiveWalkCard({ aw }) {
    const timer = walkTimers[aw.id]
    const remaining = timer?.remaining ?? (aw.status === 'in_progress' ? 0 : null)
    const isUrgent = remaining !== null && remaining <= 300
    const isCritical = remaining !== null && remaining <= 60

    return (
      <div
        className={`pd-active-card ${aw.status === 'in_progress' ? 'in-progress' : 'accepted'} ${isUrgent ? 'urgent' : ''} ${isCritical ? 'critical' : ''}`}
        onClick={() => setExpandedWalk(expandedWalk === aw.id ? null : aw.id)}
      >
        <div className="pd-active-card-top">
          <div className="pd-active-dog-avatar">{getInitials(aw.dog?.name || 'P')}</div>
          <div className="pd-active-info">
            <div className="pd-active-dog-name">
              🐕 {aw.dog?.name || 'Perro'}
              {aw.dog?.size && <span className="pd-active-size-chip">{aw.dog.size}</span>}
            </div>
            <div className="pd-active-client">
              {aw.cliente?.full_name || 'Cliente'} · {aw.duration_minutes} min · {formatPrice(aw.total_price)}
            </div>
          </div>
          <div className="pd-active-timer-wrap">
            {aw.status === 'in_progress' ? (
              <span className={`pd-active-timer ${isUrgent ? 'urgent' : ''}`}>
                {isCritical ? '🚨' : isUrgent ? '⚠️' : '⏱'}
                {remaining !== null ? formatSeconds(remaining) : '…'}
              </span>
            ) : (
              <span className="pd-active-status-badge">ESPERANDO</span>
            )}
          </div>
        </div>

        {expandedWalk === aw.id && (
          <div className="pd-active-card-body">
            {aw.address && (
              <div className="pd-active-address">📍 {aw.address}</div>
            )}
            {aw.cliente?.phone && (
              <a href={`tel:${aw.cliente.phone}`} className="pd-active-phone" onClick={e => e.stopPropagation()}>
                📞 {aw.cliente.phone}
              </a>
            )}
            {isUrgent && aw.status === 'in_progress' && (
              <div className="pd-active-warning">
                ⚠️ Quedan {remaining !== null ? formatSeconds(remaining) : '—'} — devolvé a {aw.dog?.name || 'la mascota'}
              </div>
            )}
            <div className="pd-active-actions">
              {aw.status === 'accepted' && (
                <button
                  className="pd-btn-accept"
                  type="button"
                  disabled={starting[aw.id]}
                  onClick={e => { e.stopPropagation(); startWalk(aw.id) }}
                >
                  {starting[aw.id] ? 'Iniciando…' : '🦮 Iniciar paseo'}
                </button>
              )}
              {aw.status === 'in_progress' && (
                <button
                  className="pd-btn-finish"
                  type="button"
                  disabled={finishing[aw.id]}
                  onClick={e => { e.stopPropagation(); finishWalk(aw.id) }}
                >
                  {finishing[aw.id] ? 'Finalizando…' : '✅ Finalizar'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="pd-map-page">

      {/* ── Consent Modal ──────────────────────────── */}
      {showConsent && (
        <div className="pd-consent-overlay">
          <div className="pd-consent-sheet">
            <div className="pd-consent-pill" />
            <div className="pd-consent-icon-wrap">📍</div>
            <h3 className="pd-consent-title">Compartir ubicación</h3>
            <p className="pd-consent-body">
              Para recibir solicitudes cercanas y que los clientes puedan seguirte en tiempo real necesitamos tu ubicación.
            </p>
            <button className="pd-btn-primary" onClick={handleConsentGrant}>Sí, compartir ubicación</button>
            <button className="pd-btn-ghost" onClick={handleConsentDeny}>Ahora no</button>
          </div>
        </div>
      )}

      {/* ── Mapa full-screen ──────────────────────── */}
      {isLoaded && (
        <GoogleMap
          mapContainerClassName="pd-map"
          center={center}
          zoom={15}
          onLoad={onMapLoad}
          options={{ styles: DARK_MAP_STYLE, disableDefaultUI: true, zoomControl: false, gestureHandling: 'greedy' }}
        >
          {myPos && (
            <Marker position={myPos} icon={{ path: 0, fillColor: '#1DB954', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 10 }} />
          )}
          {requests.map(req => req.pickup_lat && req.pickup_lng && (
            <Marker
              key={req.id}
              position={{ lat: req.pickup_lat, lng: req.pickup_lng }}
              onClick={() => { setSelectedRequest(req); mapRef.current?.panTo({ lat: req.pickup_lat, lng: req.pickup_lng }) }}
              icon={{ path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z', fillColor: '#1DB954', fillOpacity: 1, strokeColor: '#0f2318', strokeWeight: 2, scale: 2 }}
            />
          ))}
          {activeWalks.map(aw => aw.pickup_lat && aw.pickup_lng && (
            <Marker
              key={`active-${aw.id}`}
              position={{ lat: aw.pickup_lat, lng: aw.pickup_lng }}
              icon={{ path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z', fillColor: '#FFD60A', fillOpacity: 1, strokeColor: '#1a1100', strokeWeight: 2, scale: 2 }}
            />
          ))}
        </GoogleMap>
      )}

      {/* ── Overlays flotantes ────────────────────── */}
      <div className="pd-overlay-top">
        <div className={`pd-badge-status ${isOnline ? 'online' : 'offline'}`}>
          <span className="pd-status-dot" />
          {isOnline ? 'EN LÍNEA' : 'DESCONECTADO'}
        </div>
        <div className="pd-chip-earnings">
          <span className="pd-earnings-dot" />
          <span className="pd-earnings-text">{formatPrice(todayEarnings)}</span>
        </div>
        {activeWalks.length > 0 && (
          <div className="pd-active-badge-pill">
            🦮 {activeWalks.length} en curso
          </div>
        )}
      </div>

      {/* ── Bottom Sheet — solicitud seleccionada ── */}
      {selectedRequest ? (
        <div className="pd-sheet">
          <div className="pd-drag-pill" />
          <div className="pd-req-header">
            <div className="pd-req-avatar">{getInitials(selectedRequest.dogs?.name || 'P')}</div>
            <div className="pd-req-info">
              <div className="pd-req-dog">{selectedRequest.dogs?.name || 'Perro'}</div>
              <div className="pd-req-address" title={selectedRequest.address}>
                {selectedRequest.address?.length > 38 ? selectedRequest.address.slice(0, 38) + '…' : selectedRequest.address}
              </div>
            </div>
            <button className="pd-req-close" type="button" onClick={() => setSelectedRequest(null)}>✕</button>
          </div>
          <div className="pd-req-metrics">
            <div className="pd-metric">
              <span className="pd-metric-val">{selectedRequest.distanceFromWalker != null ? `${selectedRequest.distanceFromWalker.toFixed(1)} km` : '—'}</span>
              <span className="pd-metric-label">DISTANCIA</span>
            </div>
            <div className="pd-metric-divider" />
            <div className="pd-metric">
              <span className="pd-metric-val">{selectedRequest.duration_minutes} min</span>
              <span className="pd-metric-label">DURACIÓN</span>
            </div>
            <div className="pd-metric-divider" />
            <div className="pd-metric">
              <span className="pd-metric-val pd-metric-green">{formatPrice(selectedRequest.recalcPrice)}</span>
              <span className="pd-metric-label">PAGO</span>
            </div>
          </div>
          <div className="pd-req-chips">
            <span className="pd-chip">{selectedRequest.dogs?.size || 'mediano'}</span>
            {selectedRequest.payment_method && (
              <span className="pd-chip">{PAYMENT_ICONS[selectedRequest.payment_method]} {selectedRequest.payment_method}</span>
            )}
          </div>
          <div className="pd-req-actions">
            <button className="pd-btn-reject" type="button" onClick={() => dismissRequest(selectedRequest.id)}>Rechazar</button>
            <button className="pd-btn-accept" type="button" onClick={() => acceptRequest(selectedRequest)} disabled={accepting}>
              {accepting ? 'Aceptando…' : 'Aceptar'}
            </button>
          </div>
        </div>

      ) : (
        /* ── Bottom Sheet — estado general ──────── */
        <div className="pd-sheet">
          <div className="pd-drag-pill" />

          {/* Paseos en curso */}
          {activeWalks.length > 0 && (
            <div className="pd-section">
              <div className="pd-section-header">
                <span className="pd-section-title">🦮 Paseos en curso</span>
                <span className="pd-section-count">{activeWalks.length}</span>
              </div>
              <div className="pd-active-list">
                {activeWalks.map(aw => <ActiveWalkCard key={aw.id} aw={aw} />)}
              </div>
              <div className="pd-separator" />
            </div>
          )}

          {/* Header general */}
          <div className="pd-waiting-row">
            <div className="pd-waiting-icon-wrap">🐾</div>
            <div className="pd-waiting-text">
              <div className="pd-waiting-title">
                {requests.length > 0
                  ? `${requests.length} solicitud${requests.length > 1 ? 'es' : ''} disponible${requests.length > 1 ? 's' : ''}`
                  : activeWalks.length > 0 ? 'Sin nuevas solicitudes' : 'Esperando solicitudes…'}
              </div>
              <div className="pd-waiting-sub">
                {isOnline ? 'Ubicación activa' : 'Activá tu ubicación para recibir solicitudes'}
              </div>
            </div>
            {requests.length > 0 && (
              <span className="pd-requests-badge">{requests.length}</span>
            )}
          </div>

          {/* Stats (solo cuando no hay paseos activos) */}
          {activeWalks.length === 0 && (
            <>
              <div className="pd-separator" />
              <div className="pd-stats-grid">
                <div className="pd-stat-card">
                  <span className="pd-stat-val">★ 5.0</span>
                  <span className="pd-stat-label">PUNTAJE</span>
                </div>
                <div className="pd-stat-card">
                  <span className="pd-stat-val">{totalWalks}</span>
                  <span className="pd-stat-label">PASEOS</span>
                </div>
                <div className="pd-stat-card">
                  <span className="pd-stat-val pd-stat-green">{formatPrice(todayEarnings)}</span>
                  <span className="pd-stat-label">HOY</span>
                </div>
              </div>
            </>
          )}

          {/* Lista de solicitudes pendientes */}
          {requests.length > 0 && (
            <div className="pd-mini-list">
              {requests.map(req => (
                <button
                  key={req.id}
                  type="button"
                  className="pd-mini-card"
                  onClick={() => {
                    setSelectedRequest(req)
                    if (req.pickup_lat && req.pickup_lng) mapRef.current?.panTo({ lat: req.pickup_lat, lng: req.pickup_lng })
                  }}
                >
                  <div className="pd-mini-left">
                    <div className="pd-mini-dog">🐕 {req.dogs?.name || 'Perro'}</div>
                    <div className="pd-mini-meta">
                      {req.duration_minutes} min
                      {req.distanceFromWalker != null && ` · ${req.distanceFromWalker.toFixed(1)} km`}
                      {req.payment_method && ` · ${PAYMENT_ICONS[req.payment_method]}`}
                    </div>
                  </div>
                  <div className="pd-mini-right">
                    <span className="pd-mini-price">{formatPrice(req.recalcPrice)}</span>
                    <span className="pd-mini-arrow">›</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
