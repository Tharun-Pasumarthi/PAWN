import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowLeft, Fingerprint, UserPlus, Trash2, ShieldCheck, AlertCircle, Loader2,
  Lock, Smartphone, Copy, CheckCircle
} from 'lucide-react'
import {
  isBiometricAvailable,
  getRegisteredUsers,
  registerUser,
  removeUser,
  authenticateUser,
  isTotpSetUp,
  generateTotpSecret,
  saveTotpSecret,
  verifyTotpCode,
  type BioUser
} from '../services/biometricAuth'

export default function Settings() {
  const navigate = useNavigate()

  // ─── TOTP Gate state ───
  const [unlocked, setUnlocked] = useState(false)
  const [totpExists, setTotpExists] = useState(false)
  // Setup flow
  const [setupSecret, setSetupSecret] = useState('')
  const [setupUri, setSetupUri] = useState('')
  const [secretCopied, setSecretCopied] = useState(false)
  // Verification
  const [otpCode, setOtpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')
  const codeRef = useRef<HTMLInputElement>(null)

  // ─── Biometric management state ───
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null)
  const [users, setUsers] = useState<BioUser[]>([])
  const [newName, setNewName] = useState('')
  const [registering, setRegistering] = useState(false)
  const [removingName, setRemovingName] = useState<string | null>(null)

  useEffect(() => {
    const exists = isTotpSetUp()
    setTotpExists(exists)
    if (!exists) {
      // Generate setup data for first-time setup
      const { secret, uri } = generateTotpSecret()
      setSetupSecret(secret)
      setSetupUri(uri)
    }
  }, [])

  useEffect(() => {
    if (unlocked) {
      isBiometricAvailable().then(setBioAvailable)
      setUsers(getRegisteredUsers())
    }
  }, [unlocked])

  useEffect(() => {
    if (!unlocked) codeRef.current?.focus()
  }, [unlocked, totpExists])

  // ─── TOTP handlers ───
  const handleVerifyAndSetup = () => {
    const code = otpCode.replace(/\s/g, '')
    if (code.length !== 6) { setOtpError('Enter the 6-digit code'); return }
    setVerifying(true)
    setOtpError('')

    // For first-time setup, temporarily save secret to verify against it
    if (!totpExists) {
      saveTotpSecret(setupSecret)
    }

    const valid = verifyTotpCode(code)

    if (!totpExists && !valid) {
      // Rollback: remove the temp-saved secret since verification failed
      localStorage.removeItem('pawnvault_totp_secret')
    }

    if (valid) {
      if (!totpExists) {
        // First time — secret already saved, mark as set up
        setTotpExists(true)
        toast.success('Authenticator app linked successfully!')
      } else {
        toast.success('Settings unlocked')
      }
      setUnlocked(true)
    } else {
      setOtpError('Invalid code. Check your authenticator app and try again.')
      setOtpCode('')
      codeRef.current?.focus()
    }
    setVerifying(false)
  }

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(setupSecret)
      setSecretCopied(true)
      toast.success('Secret copied!')
      setTimeout(() => setSecretCopied(false), 2000)
    } catch {
      toast.error('Copy failed — manually select the code above')
    }
  }

  // ─── Biometric handlers ───
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
    if (users.length > 0) {
      const authed = await authenticateUser()
      if (!authed) {
        toast.error('Biometric verification required to remove a user')
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

          {/* ═══ TOTP GATE ═══ */}
          {!unlocked ? (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', margin: '0 auto 16px',
                  background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {totpExists ? <Lock size={32} color="var(--accent)" /> : <Smartphone size={32} color="var(--accent)" />}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {totpExists ? 'Verify to Unlock' : 'Link Authenticator App'}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                  {totpExists
                    ? 'Open your authenticator app and enter the 6-digit code for PawnVault'
                    : 'Scan the QR code below with Microsoft Authenticator, Google Authenticator, or any TOTP app'}
                </div>
              </div>

              {/* ─── First-time setup: show QR code ─── */}
              {!totpExists && setupUri && (
                <div className="card" style={{ marginBottom: 20, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
                    Step 1 — Scan QR Code
                  </div>

                  <div style={{
                    display: 'inline-block', padding: 16, background: 'white',
                    borderRadius: 'var(--radius-md)', border: '2px solid var(--border-subtle)', marginBottom: 16
                  }}>
                    <QRCodeSVG value={setupUri} size={200} level="M" />
                  </div>

                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Can't scan? Manually enter this key in your app:
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                    padding: '10px 16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: '0.875rem',
                    fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-primary)', wordBreak: 'break-all'
                  }}>
                    <span style={{ flex: 1, textAlign: 'center' }}>{setupSecret}</span>
                    <button
                      onClick={handleCopySecret}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0,
                        color: secretCopied ? 'var(--success)' : 'var(--text-muted)'
                      }}
                    >
                      {secretCopied ? <CheckCircle size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* ─── Enter 6-digit code ─── */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
                  {totpExists ? 'Enter Code' : 'Step 2 — Enter Verification Code'}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <input
                    ref={codeRef}
                    className="field-input"
                    style={{
                      width: '100%', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '0.5em',
                      textAlign: 'center', padding: '16px 20px'
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyAndSetup()}
                    placeholder="000000"
                    autoComplete="one-time-code"
                  />
                </div>

                {otpError && (
                  <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.8125rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={14} />
                    {otpError}
                  </div>
                )}
              </div>

              <motion.button
                className="btn btn-primary btn-lg btn-full"
                onClick={handleVerifyAndSetup}
                disabled={verifying || otpCode.length !== 6}
                whileTap={{ scale: 0.97 }}
                style={{ borderRadius: 'var(--radius-xl)', fontSize: '1rem', fontWeight: 700, padding: '16px 32px', marginBottom: 20 }}
              >
                {verifying ? <Loader2 size={20} className="spin" /> : <ShieldCheck size={18} />}
                {verifying ? 'Verifying…' : totpExists ? 'Unlock Settings' : 'Verify & Link App'}
              </motion.button>

              {!totpExists && (
                <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <strong>Supported apps:</strong> Microsoft Authenticator, Google Authenticator,<br />
                  Authy, 1Password, or any TOTP-compatible app.
                </div>
              )}
            </div>

          ) : (

          /* ═══ BIOMETRIC MANAGEMENT (after authenticator unlock) ═══ */
          <>
            <div className="card" style={{ marginBottom: 20, background: 'var(--accent-light)', border: '1px solid var(--accent)' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
                How Biometric Protection Works
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <li><strong>Register</strong> — Enter a name and scan fingerprint or face below</li>
                <li><strong>Protect</strong> — Edit, Delete, and Release actions will require the scan</li>
                <li><strong>Strict</strong> — Without a registered user, no one can edit/delete/release items</li>
              </ol>
            </div>

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
                  Biometric authentication is not available on this device
                </div>
              )}
            </div>

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

            <div className="card" style={{ marginBottom: 40 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 16 }}>
                Registered Users ({users.length})
              </div>

              {users.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)' }}>
                  <Fingerprint size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>No users registered</div>
                  <div style={{ fontSize: '0.8125rem', marginTop: 4 }}>
                    Register a user above to enable biometric protection.<br />
                    <strong style={{ color: 'var(--danger)' }}>Without a registered user, edit/delete/release will be blocked.</strong>
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
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px', background: 'var(--bg-elevated)',
                          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)'
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
          </>
          )}
        </motion.div>
      </main>
    </>
  )
}
