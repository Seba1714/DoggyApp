import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const PAYMENT_TYPES = [
  { key: 'efectivo',      label: 'Efectivo',      icon: '💵', note: 'Solo billetes, sin cambio' },
  { key: 'transferencia', label: 'Transferencia',  icon: '🏦', note: 'CBU / Alias' },
  { key: 'tarjeta',       label: 'Tarjeta',        icon: '💳', note: 'Débito / Crédito' },
]

const DEFAULT_METHODS = {
  efectivo:      { enabled: false, info: '' },
  transferencia: { enabled: false, info: '' },
  tarjeta:       { enabled: false, info: '' },
}

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

export default function PaseadorProfile() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [methods, setMethods] = useState(DEFAULT_METHODS)
  const [savingMethods, setSavingMethods] = useState(false)
  const [editField, setEditField] = useState(null) // 'full_name' | 'phone' | 'email' | null

  useEffect(() => {
    if (profile) {
      setForm({ full_name: profile.full_name || '', phone: profile.phone || '', email: profile.email || '' })
      const stored = profile.payment_methods || {}
      setMethods({
        efectivo:      { ...DEFAULT_METHODS.efectivo,      ...stored.efectivo },
        transferencia: { ...DEFAULT_METHODS.transferencia, ...stored.transferencia },
        tarjeta:       { ...DEFAULT_METHODS.tarjeta,       ...stored.tarjeta },
      })
    }
  }, [profile?.id])

  async function saveProfile() {
    if (!form.full_name.trim()) { toast.error('El nombre no puede estar vacío'); return }
    setSavingProfile(true)
    const { error } = await supabase
      .from('paseadores')
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim(), email: form.email.trim() })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) { toast.error('Error al guardar'); return }
    await refreshProfile()
    setEditField(null)
    toast.success('Datos actualizados')
  }

  function toggleMethod(key) {
    setMethods(prev => ({ ...prev, [key]: { ...prev[key], enabled: !prev[key].enabled } }))
  }

  function setMethodInfo(key, info) {
    setMethods(prev => ({ ...prev, [key]: { ...prev[key], info } }))
  }

  async function saveMethods() {
    for (const t of PAYMENT_TYPES) {
      if (methods[t.key].enabled && t.key !== 'efectivo' && !methods[t.key].info.trim()) {
        toast.error(`Completá los datos de ${t.label}`)
        return
      }
    }
    if (!PAYMENT_TYPES.some(t => methods[t.key].enabled)) {
      toast.error('Seleccioná al menos un método de cobro')
      return
    }
    setSavingMethods(true)
    const { error } = await supabase.from('paseadores').update({ payment_methods: methods }).eq('id', profile.id)
    setSavingMethods(false)
    if (error) { toast.error('Error al guardar'); return }
    await refreshProfile()
    toast.success('Métodos guardados')
  }

  const FIELD_LABELS = { full_name: 'NOMBRE', phone: 'TELÉFONO', email: 'EMAIL' }
  const FIELD_PLACEHOLDERS = { full_name: 'Tu nombre completo', phone: '+54 11 0000-0000', email: 'tu@email.com' }

  return (
    <div className="pd-profile-page">

      {/* ── Header ──────────────────────────────────── */}
      <div className="pd-profile-header">
        <div className="pd-profile-avatar">
          <span className="pd-profile-initials">{getInitials(profile?.full_name)}</span>
        </div>
        <div className="pd-profile-header-info">
          <h2 className="pd-profile-name">{profile?.full_name}</h2>
          <span className="pd-active-badge">PASEADOR</span>
        </div>
        <div className="pd-profile-rating">
          <span className="pd-rating-stars">★★★★★</span>
          <span className="pd-rating-text">5.0</span>
        </div>
      </div>
      <div className="pd-separator-full" />

      {/* ── Mis datos ───────────────────────────────── */}
      <div className="pd-section-label">MIS DATOS</div>
      <div className="pd-field-block">
        {['full_name', 'phone', 'email'].map((field, i) => (
          <div key={field}>
            {i > 0 && <div className="pd-field-separator" />}
            <div
              className="pd-field-row"
              onClick={() => setEditField(editField === field ? null : field)}
            >
              <div>
                <div className="pd-field-label">{FIELD_LABELS[field]}</div>
                {editField === field ? (
                  <input
                    className="pd-field-input"
                    type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                    value={form[field]}
                    placeholder={FIELD_PLACEHOLDERS[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <div className="pd-field-value">{form[field] || <span className="pd-field-empty">{FIELD_PLACEHOLDERS[field]}</span>}</div>
                )}
              </div>
              <span className="pd-field-chevron">{editField === field ? '›' : '›'}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="pd-btn-primary pd-btn-margin"
        onClick={saveProfile}
        disabled={savingProfile}
      >
        {savingProfile ? 'Guardando...' : 'Guardar cambios'}
      </button>

      {/* ── Métodos de cobro ────────────────────────── */}
      <div className="pd-section-label" style={{ marginTop: 28 }}>MÉTODOS DE COBRO</div>

      <div className="pd-methods-list">
        {PAYMENT_TYPES.map(type => {
          const on = methods[type.key].enabled
          return (
            <div key={type.key} className={`pd-method-card ${on ? 'active' : ''}`}>
              <div className="pd-method-row">
                <div className="pd-method-icon-wrap">{type.icon}</div>
                <div className="pd-method-info">
                  <div className="pd-method-label">{type.label}</div>
                  <div className="pd-method-note">{type.note}</div>
                </div>
                {/* Toggle iOS-style */}
                <button
                  type="button"
                  className={`pd-toggle ${on ? 'on' : 'off'}`}
                  onClick={() => toggleMethod(type.key)}
                  aria-label={`Toggle ${type.label}`}
                >
                  <span className="pd-toggle-knob" />
                </button>
              </div>

              {on && (
                <div className="pd-method-input-row">
                  <input
                    className="pd-method-input"
                    type="text"
                    placeholder={`Detalles de ${type.label.toLowerCase()}`}
                    value={methods[type.key].info}
                    onChange={e => setMethodInfo(type.key, e.target.value)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className="pd-btn-primary pd-btn-margin"
        onClick={saveMethods}
        disabled={savingMethods}
      >
        {savingMethods ? 'Guardando...' : 'Guardar métodos de cobro'}
      </button>

      {/* ── Cerrar sesión ───────────────────────────── */}
      <button
        type="button"
        className="pd-btn-signout"
        onClick={signOut}
        style={{ marginTop: 32 }}
      >
        Cerrar sesión
      </button>

      {/* Padding final */}
      <div style={{ height: 32 }} />
    </div>
  )
}
