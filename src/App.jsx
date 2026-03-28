import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BottomTabs } from './components/BottomTabs'
import Auth from './pages/Auth'
import ClienteHome from './pages/cliente/Home'
import RequestForm from './pages/cliente/RequestForm'
import Tracking from './pages/cliente/Tracking'
import History from './pages/cliente/History'
import ClienteProfile from './pages/cliente/Profile'
import PaseadorHome from './pages/paseador/PaseadorHome'
import Earnings from './pages/paseador/Earnings'
import PaseadorProfile from './pages/paseador/PaseadorProfile'

const CLIENTE_TABS = [
  { path: '/cliente', icon: '🏠', label: 'Inicio' },
  { path: '/cliente/solicitar', icon: '🐕', label: 'Solicitar' },
  { path: '/cliente/seguimiento', icon: '📍', label: 'Seguimiento' },
  { path: '/cliente/historial', icon: '📋', label: 'Historial' },
  { path: '/cliente/perfil', icon: '👤', label: 'Perfil' },
]

const PASEADOR_TABS = [
  { path: '/paseador', icon: '🗺️', label: 'Mapa' },
  { path: '/paseador/ganancias', icon: '💰', label: 'Ganancias' },
  { path: '/paseador/perfil', icon: '👤', label: 'Perfil' },
]

function ClienteLayout() {
  return (
    <div className="app-layout">
      <div className="page-content">
        <Outlet />
      </div>
      <BottomTabs tabs={CLIENTE_TABS} />
    </div>
  )
}

function PaseadorLayout() {
  return (
    <div className="app-layout pd-layout">
      <div className="pd-page-content">
        <Outlet />
      </div>
      <BottomTabs tabs={PASEADOR_TABS} dark />
    </div>
  )
}

function ProtectedRoutes() {
  const { session, profile, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="loading-logo">🐾</span>
        <p>Cargando DoggyApp...</p>
      </div>
    )
  }

  if (!session || !profile || !role) {
    return <Navigate to="/auth" replace />
  }

  if (role === 'cliente') {
    return (
      <Routes>
        <Route element={<ClienteLayout />}>
          <Route index element={<Navigate to="/cliente" replace />} />
          <Route path="cliente" element={<ClienteHome />} />
          <Route path="cliente/solicitar" element={<RequestForm />} />
          <Route path="cliente/seguimiento" element={<Tracking />} />
          <Route path="cliente/historial" element={<History />} />
          <Route path="cliente/perfil" element={<ClienteProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="/cliente" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<PaseadorLayout />}>
        <Route index element={<Navigate to="/paseador" replace />} />
        <Route path="paseador" element={<PaseadorHome />} />
        <Route path="paseador/ganancias" element={<Earnings />} />
        <Route path="paseador/perfil" element={<PaseadorProfile />} />
      </Route>
      <Route path="*" element={<Navigate to="/paseador" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              borderRadius: '12px',
              background: '#333',
              color: '#fff',
              fontSize: '14px',
            },
          }}
        />
        <Routes>
          <Route path="/auth" element={<AuthGate />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function AuthGate() {
  const { session, profile, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="loading-logo">🐾</span>
        <p>Cargando DoggyApp...</p>
      </div>
    )
  }

  if (session && profile && role) {
    return <Navigate to={role === 'cliente' ? '/cliente' : '/paseador'} replace />
  }

  return <Auth />
}
