import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Dashboard from './pages/Dashboard'
import AddItem from './pages/AddItem'
import Items from './pages/Items'
import ReleaseItem from './pages/ReleaseItem'
import History from './pages/History'
import Settings from './pages/Settings'
import Login from './pages/Login'
import InstallBanner from './components/InstallBanner'
import OfflineBanner from './components/OfflineBanner'
import UpdatePrompt from './components/UpdatePrompt'
import BottomNav from './components/BottomNav'
import { Loader2 } from 'lucide-react'

function AppRoutes() {
  const { user, loading } = useAuth()

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
        <Route path="/add" element={<AddItem />} />
        <Route path="/release" element={<ReleaseItem />} />
        <Route path="/history" element={<History />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
      <InstallBanner />
      <UpdatePrompt />
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
