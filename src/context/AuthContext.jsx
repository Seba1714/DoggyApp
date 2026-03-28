import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId, userRole) {
    const table = userRole === 'paseador' ? 'paseadores' : 'clientes'
    const { data } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .single()
    setProfile(data)
    setRole(userRole)
    return data
  }

  function getRoleFromSession(sess) {
    return sess?.user?.user_metadata?.role || null
  }

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: sess } }) => {
        setSession(sess)
        const r = getRoleFromSession(sess)
        if (sess?.user && r) {
          return fetchProfile(sess.user.id, r)
        }
      })
      .catch(() => {
        setSession(null)
        setProfile(null)
        setRole(null)
      })
      .finally(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess)
        const r = getRoleFromSession(sess)
        if (sess?.user && r) {
          try {
            await fetchProfile(sess.user.id, r)
          } catch {
            setProfile(null)
            setRole(null)
          }
        } else {
          setProfile(null)
          setRole(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signUp({ email, password, fullName, phone, role: selectedRole }) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone, role: selectedRole },
      },
    })
    if (authError) throw authError

    if (authData.session) {
      setRole(selectedRole)
      await fetchProfile(authData.user.id, selectedRole)
    }

    return authData
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const r = data.user?.user_metadata?.role
    if (r) {
      await fetchProfile(data.user.id, r)
    }
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setRole(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      session,
      profile,
      role,
      loading,
      signUp,
      signIn,
      signOut,
      refreshProfile: () => {
        if (session?.user && role) return fetchProfile(session.user.id, role)
      },
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
