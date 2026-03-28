import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Auth() {
  const { signIn, signUp } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: '',
    role: '',
  })

  function update(field) {
    return (e) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (isRegister && !form.role) {
      toast.error('Seleccioná tu tipo de cuenta')
      return
    }
    setLoading(true)
    try {
      if (isRegister) {
        const result = await signUp(form)
        if (result.session) {
          toast.success('Cuenta creada correctamente')
        } else {
          toast.success('Revisá tu email para confirmar la cuenta')
          setIsRegister(false)
        }
      } else {
        await signIn({ email: form.email, password: form.password })
        toast.success('Bienvenido!')
      }
    } catch (err) {
      toast.error(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-header">
        <span className="auth-logo">🐾</span>
        <h1>DoggyApp</h1>
        <p>Paseos seguros para tu mejor amigo</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegister && (
          <>
            <div className="role-selector">
              <button
                type="button"
                className={`role-card ${form.role === 'cliente' ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, role: 'cliente' }))}
              >
                <span className="role-icon">🐶</span>
                <span className="role-title">Soy dueño de perro</span>
                <span className="role-desc">Quiero pasear a mi mascota</span>
              </button>
              <button
                type="button"
                className={`role-card ${form.role === 'paseador' ? 'selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, role: 'paseador' }))}
              >
                <span className="role-icon">🦮</span>
                <span className="role-title">Soy paseador</span>
                <span className="role-desc">Quiero pasear perros</span>
              </button>
            </div>

            <input
              type="text"
              placeholder="Nombre completo"
              value={form.fullName}
              onChange={update('fullName')}
              required
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={form.phone}
              onChange={update('phone')}
              required
            />
          </>
        )}

        <input
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={update('email')}
          required
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={form.password}
          onChange={update('password')}
          required
          minLength={6}
        />

        <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
          {loading ? 'Cargando...' : isRegister ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>

        <button
          type="button"
          className="btn btn-link"
          onClick={() => setIsRegister(!isRegister)}
        >
          {isRegister ? '¿Ya tenés cuenta? Iniciá sesión' : '¿No tenés cuenta? Registrate'}
        </button>
      </form>
    </div>
  )
}
