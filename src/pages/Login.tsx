import { useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Scale, Phone, Lock, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()

  const [mobile, setMobile] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!mobile.trim() || !password.trim()) {
      setError('Enter mobile number and password')
      return
    }

    setLoading(true)
    try {
      const result = await signIn(mobile.trim(), password)
      if (result.error) {
        setError('Invalid mobile number or password')
        return
      }
      toast.success('Welcome back!')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg-primary)' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ width: '100%', maxWidth: 400 }}
      >
        {/* ─── Brand ─── */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
            background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Scale size={36} color="var(--accent)" />
          </div>
          <div style={{ fontSize: '1.625rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            PawnVault
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Sign in to your shop
          </div>
        </div>

        {/* ─── Form ─── */}
        <form onSubmit={handleSubmit}>
          <div className="card" style={{ padding: 24, marginBottom: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Mobile Number */}
              <div className="field">
                <label className="field-label">Mobile Number</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    className="field-input"
                    style={{ width: '100%', paddingLeft: 42, fontSize: '1.0625rem', letterSpacing: '0.04em' }}
                    type="tel"
                    inputMode="numeric"
                    value={mobile}
                    onChange={e => { setMobile(e.target.value.replace(/\D/g, '')); setError('') }}
                    placeholder="Enter mobile number"
                    autoComplete="tel"
                    autoFocus
                  />
                </div>
              </div>

              {/* Password */}
              <div className="field">
                <label className="field-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    className="field-input"
                    style={{ width: '100%', paddingLeft: 42, paddingRight: 46 }}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="Password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  marginTop: 16, padding: '10px 14px', background: 'var(--danger-bg)',
                  borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--danger)',
                  display: 'flex', alignItems: 'center', gap: 8
                }}
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}
          </div>

          <motion.button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            style={{ borderRadius: 'var(--radius-xl)', fontSize: '1rem', fontWeight: 700, padding: '16px 32px' }}
          >
            {loading ? <Loader2 size={20} className="spin" /> : null}
            {loading ? 'Signing In…' : 'Sign In'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
