import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react'
import { verifyTotpCode } from '../services/biometricAuth'

interface Props {
  reason: string
  onSuccess: () => void
  onCancel: () => void
}

export default function TotpVerifyModal({ reason, onSuccess, onCancel }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleVerify = () => {
    const c = code.replace(/\s/g, '')
    if (c.length !== 6) { setError('Enter the 6-digit code'); return }
    setVerifying(true)
    setError('')
    if (verifyTotpCode(c)) {
      onSuccess()
    } else {
      setError('Invalid code. Try again.')
      setCode('')
      setVerifying(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 20px'
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
          padding: '28px 24px', width: '100%', maxWidth: 360,
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
            background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ShieldCheck size={24} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Verification Required
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {reason}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Open Microsoft Authenticator and enter the 6-digit code for PawnVault
          </div>
        </div>

        <input
          ref={inputRef}
          className="field-input"
          style={{
            width: '100%', fontSize: '1.75rem', fontWeight: 800,
            letterSpacing: '0.45em', textAlign: 'center',
            padding: '14px 16px', marginBottom: 10
          }}
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="000000"
          autoComplete="one-time-code"
        />

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', background: 'var(--danger-bg)',
            borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem',
            color: 'var(--danger)', marginBottom: 10
          }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <motion.button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleVerify}
            disabled={verifying || code.length !== 6}
            whileTap={{ scale: 0.97 }}
          >
            {verifying ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
            {verifying ? 'Verifying…' : 'Verify'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
