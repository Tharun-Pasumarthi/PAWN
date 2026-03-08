import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Dashboard from './pages/Dashboard'
import AddItem from './pages/AddItem'
import ReleaseItem from './pages/ReleaseItem'
import History from './pages/History'
import InstallBanner from './components/InstallBanner'
import OfflineBanner from './components/OfflineBanner'
import UpdatePrompt from './components/UpdatePrompt'

export default function App() {
  return (
    <BrowserRouter>
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
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/add" element={<AddItem />} />
        <Route path="/release" element={<ReleaseItem />} />
        <Route path="/history" element={<History />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallBanner />
      <UpdatePrompt />
    </BrowserRouter>
  )
}
