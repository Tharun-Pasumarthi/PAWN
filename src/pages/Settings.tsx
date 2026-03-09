import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Fingerprint, UserPlus, Trash2, ShieldCheck, AlertCircle, Loader2
} from 'lucide-react'
import {
  isBiometricAvailable,
  getRegisteredUsers,
  registerUser,
  removeUser,
  authenticateUser,
  type BioUser
} from '../services/biometricAuth'

export default function Settings() {
  const navigate = useNavigate()

  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null)
  const [users, setUsers] = useState<BioUser[]>([])
  const [newName, setNewName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [removingName, setRemovingName] = useState<string | null>(null)

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable)
    setUsers(getRegisteredUsers())
  }, [])

  const handleRegister = async () => {
    const name = newName.trim()
    if (!name) { toast.error('Enter a name'); return }

    setRegistering(true)
    try {
      const result = await registerUser(name)
      if (result.success) {
        toast.success(`${name} registered successfully!`)
        setUsers(getRegisteredUsers())
        setNewName('')
      } else {
        toast.error(result.error || 'Registration failed')
      }
    } catch {
      toast.error('Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  const handleRemove = async (name: string) => {
    // Require biometric auth to remove a user
    if (users.length > 0) {
      const authed = await authenticateUser()
      if (!authed) {
        toast.error('Authentication required to remove a user')
        return
      }
    }

    setRemovingName(name)
    try {
      const removed = removeUser(name)
      if (removed) {
        toast.success(`${name} removed`)
        setUsers(getRegisteredUsers())
      } else {
        toast.error('User not found')
      }
    } finally {
      setRemovingName(null)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">Settings</span>
        </div>
      </header>

      <div style={{ height: 3, background: 'var(--accent)' }} />

      <main className="page-shell" style={{ paddingTop: 24 }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ maxWidth: 560, margin: '0 auto' }}
        >
          {/* ─── How it works ─── */}
          <div className="card" style={{ marginBottom: 20, background: 'var(--accent-light)', border: '1px solid var(--accent)' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
              How Biometric Protection Works
            </div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <li><strong>Register</strong> — Enter a name and scan your fingerprint or face below</li>
              <li><strong>Protect</strong> — Edit, Delete, and Release actions will now require your scan</li>
              <li><strong>Verify</strong> — Each time, the device will ask for your fingerprint or face to proceed</li>
            </ol>
          </div>

          {/* ─── Biometric Status ─── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Fingerprint size={20} color="var(--accent)" />
              <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>
                Biometric Authentication
              </div>
            </div>

            {bioAvailable === null ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
                <Loader2 size={20} className="spin" />
              </div>
            ) : bioAvailable ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--accent)' }}>
                <ShieldCheck size={16} />
                Fingerprint / Face ID is available on this device
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--warning)' }}>
                <AlertCircle size={16} />
                Biometric authentication is not available on this device. A confirmation dialog will be used instead.
              </div>
            )}
          </div>

          {/* ─── Register New User ─── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
              Register New User
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                className="field-input"
                style={{ flex: 1, fontSize: '1rem', fontWeight: 600 }}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Enter name (e.g. Tharun)"
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
                disabled={registering}
              />
              <motion.button
                className="btn btn-primary"
                onClick={handleRegister}
                disabled={registering || !newName.trim()}
                whileTap={{ scale: 0.97 }}
                style={{ borderRadius: 'var(--radius-md)', padding: '12px 20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {registering ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
                {registering ? 'Scanning…' : 'Register'}
              </motion.button>
            </div>

            <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              The device will prompt for fingerprint or face scan during registration.
            </div>
          </div>

          {/* ─── Registered Users ─── */}
          <div className="card" style={{ marginBottom: 40 }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
              Registered Users ({users.length})
            </div>

            {users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)' }}>
                <Fingerprint size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>No users registered</div>
                <div style={{ fontSize: '0.8125rem', marginTop: 4 }}>
                  Register a user above to enable biometric protection for edit, delete, and release actions.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <AnimatePresence>
                  {users.map((u, idx) => (
                    <motion.div
                      key={u.name}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'var(--accent-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Fingerprint size={18} color="var(--accent)" />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                          {u.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Registered {new Date(u.registeredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemove(u.name)}
                        disabled={removingName === u.name}
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          border: 'none', background: 'transparent',
                          color: '#ef4444', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: removingName === u.name ? 0.5 : 1
                        }}
                      >
                        {removingName === u.name ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </main>
    </>
  )
}
