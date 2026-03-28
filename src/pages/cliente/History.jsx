import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/StatusBadge'
import { formatPrice } from '../../lib/pricing'

function EmptyHistory() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', gap: 12 }}>
      <span style={{ fontSize: 48 }}>📋</span>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Sin historial</div>
      <div style={{ fontSize: 13, color: '#ebebf5aa', textAlign: 'center' }}>
        Tu historial de paseos aparecerá acá cuando completes uno
      </div>
    </div>
  )
}

export default function History() {
  const { profile } = useAuth()
  const [walks, setWalks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    const { data } = await supabase
      .from('walk_requests')
      .select('*')
      .eq('cliente_id', profile.id)
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false })

    if (!data) { setLoading(false); return }

    const dogIds = [...new Set(data.map(w => w.dog_id).filter(Boolean))]
    let dogsMap = {}
    if (dogIds.length) {
      const { data: dd } = await supabase.from('dogs').select('id, name').in('id', dogIds)
      if (dd) dd.forEach(d => { dogsMap[d.id] = d })
    }

    const withWalkers = await Promise.all(data.map(async (walk) => {
      const { data: assignment } = await supabase
        .from('walk_assignments').select('paseador_id').eq('request_id', walk.id).maybeSingle()
      let walkerName = '—'
      if (assignment?.paseador_id) {
        const { data: p } = await supabase.from('paseadores').select('full_name').eq('id', assignment.paseador_id).single()
        if (p) walkerName = p.full_name
      }
      return { ...walk, dog: dogsMap[walk.dog_id] || null, walkerName }
    }))

    setWalks(withWalkers)
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <span style={{ color: '#ebebf5aa', fontSize: 14 }}>Cargando historial...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="cl-page-header">
        <div className="cl-page-title">Historial</div>
        <div className="cl-page-sub">Tus paseos anteriores</div>
      </div>

      {walks.length === 0 ? (
        <EmptyHistory />
      ) : (
        walks.map(walk => (
          <div className="cl-history-item" key={walk.id}>
            <div className="cl-history-left">
              <div className="cl-history-date">
                {new Date(walk.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="cl-history-name">
                🐕 {walk.dog?.name || 'Perro'} · {walk.walkerName}
              </div>
              <div className="cl-history-meta">{walk.duration_minutes} min</div>
            </div>
            <div className="cl-history-right">
              <div className="cl-history-price">{formatPrice(walk.total_price)}</div>
              <StatusBadge status={walk.status} />
            </div>
          </div>
        ))
      )}
    </div>
  )
}
