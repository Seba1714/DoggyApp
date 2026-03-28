import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/pricing'
import { getCurrentPosition } from '../../lib/geo'
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api'
import { DARK_MAP_STYLE } from '../../lib/paseadorTheme'

const BUENOS_AIRES = { lat: -34.6037, lng: -58.3816 }

const STATUS_META = {
  pending:     { label: 'Buscando paseador…', icon: '🔍', color: '#FFD60A' },
  accepted:    { label: 'Paseador en camino', icon: '🐾', color: '#1DB954' },
  in_progress: { label: 'Paseo en curso',     icon: '🦮', color: '#1DB954' },
}

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

export default function ClienteHome() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [activeWalk, setActiveWalk] = useState(null)
  const [walkerName, setWalkerName] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userPos, setUserPos] = useState(null)
  const [nearbyWalkers, setNearbyWalkers] = useState([])

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
  })

  useEffect(() => {
    fetchActiveWalk()
    fetchNearbyWalkers()

    getCurrentPosition()
      .then(pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
      .catch(() => {})

    const channel = supabase
      .channel(`cliente-walk-status-${profile.id}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'walk_requests', filter: `cliente_id=eq.${profile.id}` },
        (payload) => {
          const updated = payload.new
          if (['accepted', 'in_progress', 'pending'].includes(updated.status)) {
            setActiveWalk(updated)
            if (updated.status === 'accepted' || updated.status === 'in_progress') {
              fetchWalkerName(updated.id)
            }
          } else {
            setActiveWalk(null)
            setWalkerName(null)
          }
        }
      )
      .subscribe()

    const walkerInterval = setInterval(fetchNearbyWalkers, 30000)
    return () => { supabase.removeChannel(channel); clearInterval(walkerInterval) }
  }, [profile.id])

  async function fetchActiveWalk() {
    const { data } = await supabase
      .from('walk_requests')
      .select('*')
      .eq('cliente_id', profile.id)
      .in('status', ['pending', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setActiveWalk(data)
    if (data && (data.status === 'accepted' || data.status === 'in_progress')) {
      await fetchWalkerName(data.id)
    }
    setLoading(false)
  }

  async function fetchNearbyWalkers() {
    const { data } = await supabase
      .from('paseadores')
      .select('id, full_name, current_lat, current_lng')
      .eq('is_available', true)
      .not('current_lat', 'is', null)
      .not('current_lng', 'is', null)
    setNearbyWalkers(data || [])
  }

  async function fetchWalkerName(requestId) {
    const { data } = await supabase
      .from('walk_assignments').select('paseador_id').eq('request_id', requestId).maybeSingle()
    if (data?.paseador_id) {
      const { data: paseador } = await supabase
        .from('paseadores').select('full_name').eq('id', data.paseador_id).single()
      if (paseador) setWalkerName(paseador.full_name)
    }
  }

  async function cancelWalk() {
    if (!activeWalk) return
    await supabase.from('walk_requests').update({ status: 'cancelled' }).eq('id', activeWalk.id)
    setActiveWalk(null)
  }

  const onMapLoad = useCallback(() => {}, [])
  const mapCenter = userPos || BUENOS_AIRES
  const meta = activeWalk ? STATUS_META[activeWalk.status] : null

  return (
    <div className="cl-home">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="cl-home-header">
        <div className="cl-home-greeting">Hola, {profile.full_name?.split(' ')[0]} 👋</div>
        <div className="cl-home-avatar">{getInitials(profile.full_name)}</div>
      </div>

      {/* ── Paseo activo ──────────────────────────────── */}
      {!loading && activeWalk && meta && (
        <div className="cl-active-card">
          <div className="cl-active-card-top">
            <div className="cl-active-icon-wrap" style={{ background: meta.color + '22' }}>
              <span style={{ fontSize: 22 }}>{meta.icon}</span>
            </div>
            <div className="cl-active-info">
              <div className="cl-active-title" style={{ color: meta.color }}>{meta.label}</div>
              {walkerName && <div className="cl-active-walker">🐾 {walkerName}</div>}
              <div className="cl-active-meta">
                {activeWalk.duration_minutes} min · {formatPrice(activeWalk.total_price)}
              </div>
            </div>
          </div>
          <div className="cl-active-actions">
            <button className="cl-btn-primary" onClick={() => navigate('/cliente/seguimiento')}>
              {activeWalk.status === 'pending' ? '🔍 Ver búsqueda' : '📍 Ver seguimiento'}
            </button>
            {activeWalk.status === 'pending' && (
              <button className="cl-btn-danger" onClick={cancelWalk}>Cancelar</button>
            )}
          </div>
        </div>
      )}

      {/* ── CTA ───────────────────────────────────────── */}
      {!loading && !activeWalk && (
        <div className="cl-cta-card">
          <div className="cl-cta-paw">🐾</div>
          <div className="cl-cta-text">
            <div className="cl-cta-title">¿Querés pasear a tu perro?</div>
            <div className="cl-cta-sub">Encontrá un paseador cerca en minutos</div>
          </div>
          <button className="cl-btn-primary" onClick={() => navigate('/cliente/solicitar')}>
            Solicitar
          </button>
        </div>
      )}

      {/* ── Mapa de paseadores ────────────────────────── */}
      <div className="cl-map-section">
        <div className="cl-map-section-header">
          <span className="cl-map-section-title">Paseadores en tu zona</span>
          <span className={`cl-walker-badge ${nearbyWalkers.length > 0 ? 'available' : 'none'}`}>
            {nearbyWalkers.length > 0
              ? `${nearbyWalkers.length} disponible${nearbyWalkers.length !== 1 ? 's' : ''}`
              : 'Ninguno disponible'}
          </span>
        </div>

        <div className="cl-map-container">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={mapCenter}
              zoom={14}
              onLoad={onMapLoad}
              options={{
                styles: DARK_MAP_STYLE,
                disableDefaultUI: true,
                gestureHandling: 'none',
                zoomControl: false,
              }}
            >
              {userPos && (
                <Marker position={userPos} icon={{ path: 0, fillColor: '#6aa0ff', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3, scale: 9 }} />
              )}
              {nearbyWalkers.map(w => (
                <Marker
                  key={w.id}
                  position={{ lat: w.current_lat, lng: w.current_lng }}
                  icon={{ path: 0, fillColor: '#1DB954', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, scale: 8 }}
                />
              ))}
            </GoogleMap>
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#5c5c6e', fontSize: 13 }}>Cargando mapa...</span>
            </div>
          )}
          <div className="cl-map-legend">
            <div className="legend-item"><span className="legend-dot blue" /><span>Vos</span></div>
            <div className="legend-item"><span className="legend-dot green" /><span>Paseador</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
