import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatPrice } from '../../lib/pricing'

const COMMISSION = 0.20

function EmptyEarnings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', gap: 12 }}>
      <span style={{ fontSize: 48 }}>💰</span>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Sin ganancias aún</div>
      <div style={{ fontSize: 13, color: '#ebebf5aa', textAlign: 'center' }}>
        Completá tu primer paseo para ver tus ganancias acá
      </div>
    </div>
  )
}

export default function Earnings() {
  const { profile } = useAuth()
  const [walks, setWalks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchEarnings() }, [])

  async function fetchEarnings() {
    const { data: assignments } = await supabase
      .from('walk_assignments').select('request_id').eq('paseador_id', profile.id)
    if (!assignments?.length) { setLoading(false); return }

    const ids = assignments.map(a => a.request_id)
    const { data } = await supabase
      .from('walk_requests').select('*')
      .in('id', ids).eq('status', 'completed')
      .order('created_at', { ascending: false })

    if (data?.length) {
      const dogIds = [...new Set(data.map(w => w.dog_id).filter(Boolean))]
      let dogsMap = {}
      if (dogIds.length) {
        const { data: dd } = await supabase.from('dogs').select('id, name').in('id', dogIds)
        if (dd) dd.forEach(d => { dogsMap[d.id] = d })
      }
      setWalks(data.map(w => ({ ...w, dog: dogsMap[w.dog_id] || null })))
    }
    setLoading(false)
  }

  const now = new Date()
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const weeklyGross = walks.filter(w => new Date(w.created_at) >= startOfWeek).reduce((s, w) => s + Number(w.total_price), 0)
  const monthlyGross = walks.filter(w => new Date(w.created_at) >= startOfMonth).reduce((s, w) => s + Number(w.total_price), 0)

  if (loading) {
    return (
      <div className="pd-profile-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#ebebf5aa', fontSize: 14 }}>Cargando ganancias...</span>
      </div>
    )
  }

  return (
    <div className="pd-profile-page">

      {/* Header */}
      <div className="pd-earnings-header">
        <div className="pd-earnings-title">Ganancias</div>
        <div className="pd-earnings-sub">Tu resumen de ingresos</div>
      </div>

      {/* Summary cards */}
      <div className="pd-earnings-summary">
        <div className="pd-earnings-stat-card">
          <div className="pd-earnings-amount">{formatPrice(weeklyGross * (1 - COMMISSION))}</div>
          <div className="pd-earnings-period">Esta semana</div>
          <div className="pd-earnings-gross">Bruto: {formatPrice(weeklyGross)}</div>
        </div>
        <div className="pd-earnings-stat-card">
          <div className="pd-earnings-amount">{formatPrice(monthlyGross * (1 - COMMISSION))}</div>
          <div className="pd-earnings-period">Este mes</div>
          <div className="pd-earnings-gross">Bruto: {formatPrice(monthlyGross)}</div>
        </div>
      </div>

      {/* Commission note */}
      <div className="pd-earnings-commission-note">
        💡 DoggyApp retiene el 20% como comisión de servicio
      </div>

      {/* Walk list */}
      {walks.length === 0 ? (
        <EmptyEarnings />
      ) : (
        <div className="pd-earnings-list-section">
          <div className="pd-earnings-list-title">Historial de paseos</div>
          <div className="pd-earnings-list">
            {walks.map(walk => {
              const gross = Number(walk.total_price)
              const net = gross * (1 - COMMISSION)
              const commission = gross * COMMISSION
              return (
                <div className="pd-earnings-row" key={walk.id}>
                  <div className="pd-earnings-row-left">
                    <div className="pd-earnings-dog-name">
                      🐕 {walk.dog?.name || 'Perro'} · {walk.duration_minutes} min
                    </div>
                    <div className="pd-earnings-row-date">
                      {new Date(walk.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="pd-earnings-row-right">
                    <div className="pd-earnings-net">{formatPrice(net)}</div>
                    <div className="pd-earnings-commission">-{formatPrice(commission)} comisión</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
