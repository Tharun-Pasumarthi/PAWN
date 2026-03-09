import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../services/supabaseClient'
import type { User, Session } from '@supabase/supabase-js'
import { setActiveUserId } from '../services/biometricAuth'

// Super user UUID (8885490355) — keeps all original features + sees all shops
const SUPER_USER_ID = '3d2487eb-ee60-4f68-a153-0150b0e90578'

// Converts a mobile number to a stable internal email identifier
export function mobileToEmail(mobile: string): string {
  return `${mobile.trim()}@pawnvault.app`
}

interface AuthContextType {
  user: User | null
  session: Session | null
  shopName: string
  isSuperUser: boolean
  loading: boolean
  signIn: (mobile: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const shopName = user?.user_metadata?.shop_name || 'My Shop'
  const isSuperUser = user?.id === SUPER_USER_ID

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setActiveUserId(session?.user?.id ?? '')
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setActiveUserId(session?.user?.id ?? '')
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (mobile: string, password: string) => {
    const email = mobileToEmail(mobile)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return {}
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setActiveUserId('')
  }

  return (
    <AuthContext.Provider value={{ user, session, shopName, isSuperUser, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
