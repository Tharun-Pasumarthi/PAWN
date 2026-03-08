import { motion, AnimatePresence } from 'framer-motion'
import { Download, X } from 'lucide-react'
import { usePWAInstall } from '../hooks/usePWAInstall'
import { useState } from 'react'

export default function InstallBanner() {
  const { canInstall, install } = usePWAInstall()
  const [dismissed, setDismissed] = useState(false)

  if (!canInstall || dismissed) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        style={{
          position: 'fixed',
          bottom: 80,
          left: 16,
          right: 16,
          zIndex: 1000,
          background: 'var(--accent)',
          color: '#fff',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 8px 32px rgba(99, 102, 241, 0.35)',
        }}
      >
        <Download size={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Install PawnVault</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>Add to home screen for quick access</div>
        </div>
        <button
          onClick={install}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            borderRadius: 'var(--radius-md)',
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          Install
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.7)',
            cursor: 'pointer',
            padding: 4
          }}
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
