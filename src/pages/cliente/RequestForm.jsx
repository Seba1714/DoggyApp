import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { calculatePrice, formatPrice } from '../../lib/pricing'
import toast from 'react-hot-toast'

const PAYMENT_OPTIONS = [
  { value: 'efectivo',      icon: '💵', label: 'Efectivo' },
  { value: 'transferencia', icon: '🏦', label: 'Transfer.' },
  { value: 'tarjeta',       icon: '💳', label: 'Tarjeta' },
]

export default function RequestForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [dogs, setDogs] = useState([])
  const [selectedDog, setSelectedDog] = useState(null)
  const [loadingDogs, setLoadingDogs] = useState(true)
  const [address, setAddress] = useState('')
  const [pickupCoords, setPickupCoords] = useState(null)
  const [duration, setDuration] = useState(30)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [nearestWalker, setNearestWalker] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)

  useEffect(() => { fetchDogs(); fetchNearestWalker() }, [])

  async function fetchDogs() {
    const { data } = await supabase.from('dogs').select('*').eq('cliente_id', profile.id).order('created_at')
    setDogs(data || [])
    if (data?.length > 0) setSelectedDog(data[0].id)
    setLoadingDogs(false)
  }

  async function fetchNearestWalker() {
    const { data } = await supabase
      .from('paseadores').select('current_lat, current_lng').eq('is_available', true)
      .not('current_lat', 'is', null).not('current_lng', 'is', null).limit(1)
    if (data?.length > 0) setNearestWalker(data[0])
  }

  async function useCurrentLocation() {
    setLoadingLocation(true)
    try {
      const pos = await getCurrentPosition()
      const { latitude, longitude } = pos.coords
      setPickupCoords({ lat: latitude, lng: longitude })
      const addr = await reverseGeocode(latitude, longitude)
      setAddress(addr)
    } catch {
      toast.error('No pudimos obtener tu ubicación')
    } finally {
      setLoadingLocation(false)
    }
  }

  const pricing = calculatePrice(
    duration,
    nearestWalker?.current_lat, nearestWalker?.current_lng,
    pickupCoords?.lat, pickupCoords?.lng
  )

  async function handleSubmit() {
    if (dogs.length === 0) { toast.error('Agregá una mascota desde tu Perfil primero'); return }
    if (!selectedDog) { toast.error('Seleccioná un perro'); return }
    if (!address.trim()) { toast.error('Ingresá una dirección'); return }
    if (!paymentMethod) { toast.error('Seleccioná un método de pago'); return }

    const payload = {
      cliente_id: profile.id,
      dog_id: selectedDog,
      address,
      pickup_lat: pickupCoords?.lat ?? null,
      pickup_lng: pickupCoords?.lng ?? null,
      duration_minutes: duration,
      base_price: pricing.basePrice,
      distance_km: pricing.distanceKm,
      distance_surcharge: pricing.distanceSurcharge,
      total_price: pricing.totalPrice,
      payment_method: paymentMethod,
      search_radius_km: 0.3,
      status: 'pending',
    }

    setLoading(true)
    try {
      const { error } = await supabase.from('walk_requests').insert(payload).select()
      if (error) { toast.error('Error: ' + error.message); return }
      navigate('/cliente/seguimiento')
    } catch (err) {
      toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="cl-page-header">
        <div className="cl-page-title">Solicitar paseo</div>
        <div className="cl-page-sub">Completá los datos para tu paseo</div>
      </div>

      {/* Dirección */}
      <div className="cl-section">
        <div className="cl-section-title">📍 Punto de recogida</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="cl-input"
            type="text"
            placeholder="Ingresá tu dirección"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="cl-btn-secondary"
            onClick={useCurrentLocation}
            disabled={loadingLocation}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {loadingLocation ? '...' : '📍 GPS'}
          </button>
        </div>
      </div>

      {/* Mascota */}
      <div className="cl-section">
        <div className="cl-section-title">🐕 Tu perro</div>
        {loadingDogs ? (
          <div style={{ fontSize: 13, color: '#ebebf5aa' }}>Cargando mascotas...</div>
        ) : dogs.length === 0 ? (
          <div className="cl-no-dogs">
            No tenés mascotas cargadas.<br />
            Agregalas desde tu <strong>Perfil</strong> antes de solicitar un paseo.
          </div>
        ) : (
          dogs.map(dog => (
            <button
              key={dog.id}
              className={`cl-dog-select-card ${selectedDog === dog.id ? 'selected' : ''}`}
              onClick={() => setSelectedDog(dog.id)}
            >
              <span style={{ fontSize: 24 }}>🐕</span>
              <div>
                <div className="dog-name">{dog.name}</div>
                <div className="dog-breed">
                  {dog.gender === 'macho' ? '♂ ' : dog.gender === 'hembra' ? '♀ ' : ''}
                  {dog.breed || dog.size}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Duración */}
      <div className="cl-section">
        <div className="cl-section-title">⏱️ Duración</div>
        <div className="cl-duration-grid">
          {[30, 45, 60].map(d => (
            <button
              key={d}
              type="button"
              className={`cl-duration-btn ${duration === d ? 'active' : ''}`}
              onClick={() => setDuration(d)}
            >
              {d} min
            </button>
          ))}
        </div>
      </div>

      {/* Precio */}
      <div className="cl-section">
        <div className="cl-section-title">💰 Precio estimado</div>
        <div className="cl-price-box">
          <div className="cl-price-row"><span>Base ({duration} min)</span><span>{formatPrice(pricing.basePrice)}</span></div>
          <div className="cl-price-row"><span>Distancia ({pricing.distanceKm} km)</span><span>{formatPrice(pricing.distanceSurcharge)}</span></div>
          <div className="cl-price-total"><span>Total</span><span>{formatPrice(pricing.totalPrice)}</span></div>
          {!nearestWalker && <div className="cl-price-note">* Precio estimado — sin paseadores disponibles</div>}
        </div>
      </div>

      {/* Método de pago */}
      <div className="cl-section">
        <div className="cl-section-title">💳 Método de pago</div>
        <div className="cl-payment-grid">
          {PAYMENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`cl-payment-card ${paymentMethod === opt.value ? 'selected' : ''}`}
              onClick={() => setPaymentMethod(opt.value)}
            >
              <span className="cl-payment-icon">{opt.icon}</span>
              <span className="cl-payment-label">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <button className="cl-btn-full" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Enviando...' : '🔍 Buscar paseador'}
      </button>
    </div>
  )
}
