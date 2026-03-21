import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import toast from 'react-hot-toast'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { syncPendingPledges } from './services/pendingPledgeQueue'
import Dashboard from './pages/Dashboard'
import AddItem from './pages/AddItem'
import Items from './pages/Items'
import ReleaseItem from './pages/ReleaseItem'
import History from './pages/History'
import Settings from './pages/Settings'
import Shops from './pages/Shops'
import Login from './pages/Login'
import InstallBanner from './components/InstallBanner'
import OfflineBanner from './components/OfflineBanner'
import UpdatePrompt from './components/UpdatePrompt'
import BottomNav from './components/BottomNav'
import { Loader2 } from 'lucide-react'

function AppRoutes() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isOnline = useOnlineStatus()

  // Handle Android hardware back button
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handler = CapApp.addListener('backButton', () => {
      if (location.pathname === '/') {
        CapApp.minimizeApp()
      } else {
        navigate(-1)
      }
    })
    return () => { handler.then(h => h.remove()) }
  }, [location.pathname, navigate])

  useEffect(() => {
    if (!user || !isOnline) return

    let cancelled = false
    syncPendingPledges().then(({ synced, failed }) => {
      if (cancelled) return
      if (synced > 0) toast.success(`Synced ${synced} offline pledge(s)`)
      if (failed > 0) toast.error(`${failed} offline pledge(s) still pending`)
    })
    return () => { cancelled = true }
  }, [user, isOnline])

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="spin" color="var(--accent)" />
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/items" element={<Items />} />
        <Route path="/shops" element={<Shops />} />
        <Route path="/add" element={<AddItem />} />
        <Route path="/release" element={<ReleaseItem />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <InstallBanner />
      {!Capacitor.isNativePlatform() && <UpdatePrompt />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#ffffff',
              color: '#1f2937',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '0.875rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
            }
          }}
        />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
