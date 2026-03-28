import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const SIZE_OPTIONS = ['pequeño', 'mediano', 'grande']
const GENDER_OPTIONS = [
  { value: 'macho', label: '♂ Macho' },
  { value: 'hembra', label: '♀ Hembra' },
]

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

export default function ClienteProfile() {
  const { profile, refreshProfile, signOut } = useAuth()
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [dogs, setDogs] = useState([])
  const [loadingDogs, setLoadingDogs] = useState(true)
  const [showDogForm, setShowDogForm] = useState(false)
  const [editingDog, setEditingDog] = useState(null)
  const [dogForm, setDogForm] = useState({ name: '', gender: '', size: 'mediano' })
  const [savingDog, setSavingDog] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        email: profile.email || '',
      })
    }
    fetchDogs()
  }, [profile?.id])

  async function fetchDogs() {
    if (!profile?.id) return
    const { data, error } = await supabase.from('dogs').select('*').eq('cliente_id', profile.id).order('created_at')
    if (error) console.error('Error al obtener mascotas:', error)
    setDogs(data || [])
    setLoadingDogs(false)
  }

  async function saveProfile() {
    if (!form.full_name.trim()) { toast.error('El nombre no puede estar vacío'); return }
    setSavingProfile(true)
    const { error } = await supabase
      .from('clientes')
      .update({ full_name: form.full_name.trim(), phone: form.phone.trim(), email: form.email.trim() })
      .eq('id', profile.id)
    setSavingProfile(false)
    if (error) { toast.error('Error al guardar'); return }
    await refreshProfile()
    toast.success('Datos actualizados')
  }

  function openAddDog() {
    setEditingDog(null)
    setDogForm({ name: '', gender: '', size: 'mediano' })
    setShowDogForm(true)
  }
  function openEditDog(dog) {
    setEditingDog(dog)
    setDogForm({ name: dog.name, gender: dog.gender || '', size: dog.size })
    setShowDogForm(true)
  }

  async function saveDog() {
    if (!dogForm.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSavingDog(true)
    try {
      if (editingDog) {
        const { error } = await supabase.from('dogs')
          .update({ name: dogForm.name.trim(), gender: dogForm.gender || null, size: dogForm.size })
          .eq('id', editingDog.id).select()
        if (error) { toast.error('Error: ' + error.message); return }
        toast.success('Mascota actualizada')
      } else {
        const { error } = await supabase.from('dogs')
          .insert({ cliente_id: profile.id, name: dogForm.name.trim(), gender: dogForm.gender || null, size: dogForm.size })
          .select()
        if (error) { toast.error('Error: ' + error.message); return }
        toast.success('Mascota agregada ✅')
      }
      setShowDogForm(false)
      await fetchDogs()
    } catch (err) {
      toast.error('Error inesperado: ' + (err?.message || 'desconocido'))
    } finally {
      setSavingDog(false)
    }
  }

  async function deleteDog(dogId) {
    const { error } = await supabase.from('dogs').delete().eq('id', dogId)
    if (error) { toast.error('Error al eliminar'); return }
    setDogs(prev => prev.filter(d => d.id !== dogId))
    toast.success('Mascota eliminada')
  }

  return (
    <div>
      {/* Header con avatar */}
      <div className="cl-profile-header">
        <div className="cl-profile-avatar">{getInitials(profile.full_name)}</div>
        <div>
          <div className="cl-profile-name">{profile.full_name}</div>
          <span className="cl-profile-badge">Cliente</span>
        </div>
      </div>

      {/* Mis datos */}
      <div className="cl-section">
        <div className="cl-section-title">Mis datos</div>
        <div className="cl-field">
          <label className="cl-label">Nombre completo</label>
          <input
            className="cl-input"
            type="text"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            placeholder="Tu nombre"
          />
        </div>
        <div className="cl-field">
          <label className="cl-label">Teléfono</label>
          <input
            className="cl-input"
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+54 11 0000-0000"
          />
        </div>
        <div className="cl-field">
          <label className="cl-label">Email</label>
          <input
            className="cl-input"
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="tu@email.com"
          />
        </div>
        <button className="cl-btn-full" onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      {/* Mascotas */}
      <div className="cl-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="cl-section-title" style={{ marginBottom: 0 }}>Mis mascotas</div>
          {!showDogForm && (
            <button className="cl-btn-secondary" onClick={openAddDog} style={{ fontSize: 13, padding: '6px 14px' }}>
              + Agregar
            </button>
          )}
        </div>

        {!loadingDogs && dogs.length === 0 && !showDogForm && (
          <div style={{ fontSize: 13, color: '#ebebf5aa', textAlign: 'center', padding: '12px 0' }}>
            Todavía no cargaste ninguna mascota.
          </div>
        )}

        {/* Lista */}
        {dogs.map(dog => (
          <div key={dog.id} className="cl-dog-card">
            <div className="cl-dog-icon">🐕</div>
            <div className="cl-dog-info">
              <div className="cl-dog-name">{dog.name}</div>
              <div className="cl-dog-meta">
                {dog.gender === 'macho' ? '♂' : dog.gender === 'hembra' ? '♀' : ''}
                {dog.gender ? ' · ' : ''}{dog.size}
              </div>
            </div>
            <div className="cl-dog-actions">
              <button className="cl-dog-action-btn" onClick={() => openEditDog(dog)}>✏️</button>
              <button className="cl-dog-action-btn" onClick={() => deleteDog(dog.id)}>🗑️</button>
            </div>
          </div>
        ))}

        {/* Formulario */}
        {showDogForm && (
          <div className="cl-dog-form">
            <div className="cl-dog-form-title">{editingDog ? 'Editar mascota' : 'Nueva mascota'}</div>
            <div className="cl-field" style={{ marginBottom: 0 }}>
              <label className="cl-label">Nombre</label>
              <input
                className="cl-input"
                type="text"
                placeholder="Nombre de la mascota"
                value={dogForm.name}
                onChange={e => setDogForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="cl-field" style={{ marginBottom: 0 }}>
              <label className="cl-label">Género</label>
              <div className="cl-toggle-group">
                {GENDER_OPTIONS.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    className={`cl-toggle-btn ${dogForm.gender === g.value ? 'active' : ''}`}
                    onClick={() => setDogForm(f => ({ ...f, gender: f.gender === g.value ? '' : g.value }))}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="cl-field" style={{ marginBottom: 0 }}>
              <label className="cl-label">Tamaño</label>
              <div className="cl-toggle-group">
                {SIZE_OPTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    className={`cl-toggle-btn ${dogForm.size === s ? 'active' : ''}`}
                    onClick={() => setDogForm(f => ({ ...f, size: s }))}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="cl-dog-form-actions">
              <button type="button" className="cl-btn-full" style={{ margin: 0 }} onClick={saveDog} disabled={savingDog}>
                {savingDog ? 'Guardando...' : editingDog ? 'Guardar' : 'Agregar'}
              </button>
              <button
                type="button"
                className="cl-btn-secondary"
                onClick={() => { setShowDogForm(false); setSavingDog(false) }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cerrar sesión */}
      <div className="cl-section">
        <button className="cl-btn-signout" onClick={signOut}>Cerrar sesión</button>
      </div>
    </div>
  )
}
