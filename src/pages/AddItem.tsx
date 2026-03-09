import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Camera, ImagePlus, X, Barcode, IndianRupee, Calendar, ChevronDown, Loader2,
  SwitchCamera, Aperture, Users
} from 'lucide-react'
import { supabase, STORAGE_BUCKET } from '../services/supabaseClient'

const MEDIATORS = ['Jagadesh', 'Murali', 'Others'] as const
type MediatorOption = typeof MEDIATORS[number]

export default function AddItem() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [loading, setLoading] = useState(false)
  const [serialLoading, setSerialLoading] = useState(false)

  const [serial, setSerial] = useState('')
  const [amount, setAmount] = useState('')
  const [rateOption, setRateOption] = useState<string>('1')
  const [customRate, setCustomRate] = useState('')
  const [pledgeDate, setPledgeDate] = useState(todayStr())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [mediator, setMediator] = useState<MediatorOption | ''>('')
  const [otherName, setOtherName] = useState('')

  const [cameraOpen, setCameraOpen] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  // ─── Auto-generate serial number when mediator changes ───
  const generateSerial = useCallback(async (med: MediatorOption | '', customName: string) => {
    if (!med) { setSerial(''); return }

    setSerialLoading(true)
    try {
      let prefix: string
      let pattern: string

      if (med === 'Jagadesh') {
        prefix = 'J'
        pattern = 'J%'
      } else if (med === 'Murali') {
        prefix = 'M'
        pattern = 'M%'
      } else {
        // Others — use full name lowercase
        const name = customName.trim().toLowerCase()
        if (!name) { setSerial(''); setSerialLoading(false); return }
        prefix = name
        pattern = `${name}%`
      }

      // Query existing serial numbers with this prefix to find next number
      const { data } = await supabase
        .from('pawn_items')
        .select('serial_number')
        .like('serial_number', pattern)
        .order('created_at', { ascending: false })

      let maxNum = 0
      if (data && data.length > 0) {
        for (const row of data) {
          const sn = row.serial_number
          if (med === 'Others') {
            // Pattern: charan01, charan02...
            const match = sn.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`))
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
          } else {
            // Pattern: J-1, J-2, M-1, M-2...
            const match = sn.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`))
            if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
          }
        }
      }

      const nextNum = maxNum + 1
      if (med === 'Others') {
        setSerial(`${prefix}${String(nextNum).padStart(2, '0')}`)
      } else {
        setSerial(`${prefix}${nextNum}`)
      }
    } catch {
      toast.error('Failed to generate serial number')
    } finally {
      setSerialLoading(false)
    }
  }, [])

  const handleMediatorChange = (value: MediatorOption | '') => {
    setMediator(value)
    if (value !== 'Others') {
      setOtherName('')
      generateSerial(value, '')
    } else {
      setSerial('')
    }
  }

  const handleOtherNameChange = (name: string) => {
    setOtherName(name)
    if (name.trim()) {
      generateSerial('Others', name)
    } else {
      setSerial('')
    }
  }

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  // ─── Camera lifecycle ───
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }, [])

  const startCamera = useCallback(async (facing: 'environment' | 'user' = facingMode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false
      })
      streamRef.current = stream
      setCameraOpen(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(() => {})
        }
      })
    } catch {
      toast.error('Camera access denied or unavailable')
      stopCamera()
    }
  }, [facingMode, stopCamera])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  const flipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' })
      pickImage(file)
      stopCamera()
    }, 'image/jpeg', 0.85)
  }

  const pickImage = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Max image size is 10 MB'); return }
    setImageFile(file)
    setPreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImageFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
  }

  const handleSubmit = async () => {
    if (!mediator) { toast.error('Select a mediator'); return }
    if (mediator === 'Others' && !otherName.trim()) { toast.error('Enter mediator name'); return }
    if (!serial.trim()) { toast.error('Serial number not generated'); return }
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return }

    let rate = Number(rateOption)
    if (rateOption === 'custom') {
      rate = Number(customRate)
      if (!rate || rate <= 0) { toast.error('Enter a valid custom rate'); return }
    }

    const mediatorName = mediator === 'Others' ? otherName.trim() : mediator

    setLoading(true)
    try {
      let imageUrl: string | null = null
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, imageFile, {
            contentType: imageFile.type || 'image/jpeg',
            upsert: true
          })
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)
        const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
        imageUrl = urlData.publicUrl
      }

      const { error } = await supabase.from('pawn_items').insert([{
        serial_number: serial.trim(),
        mediator: mediator,
        mediator_name: mediatorName,
        amount: Number(amount),
        interest_rate: rate,
        pledge_date: pledgeDate,
        image_url: imageUrl,
        status: 'active'
      }])

      if (error) {
        if (error.code === '23505') { toast.error('Serial number already exists'); return }
        throw error
      }

      toast.success('Item pledged successfully')
      navigate('/')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">Add New Pledge</span>
        </div>
      </header>

      {/* Blue divider line */}
      <div style={{ height: 3, background: 'var(--accent)' }} />

      <main className="page-shell" style={{ paddingTop: 24 }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          style={{ maxWidth: 560, margin: '0 auto' }}
        >
          {/* ─── Item Photos ─── */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, display: 'block' }}>
              Item Photos
            </label>

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <AnimatePresence mode="wait">
              {cameraOpen ? (
                <motion.div
                  key="viewfinder"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    background: '#000'
                  }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      display: 'block',
                      borderRadius: 'var(--radius-lg)',
                      transform: facingMode === 'user' ? 'scaleX(-1)' : 'none'
                    }}
                  />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    gap: 24, padding: '16px 20px',
                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))'
                  }}>
                    <button type="button" onClick={stopCamera}
                      style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={18} />
                    </button>
                    <button type="button" onClick={capturePhoto}
                      style={{ width: 64, height: 64, borderRadius: '50%', background: 'white', border: '4px solid rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(255,255,255,0.3)' }}>
                      <Aperture size={28} color="#1f2937" />
                    </button>
                    <button type="button" onClick={flipCamera}
                      style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <SwitchCamera size={18} />
                    </button>
                  </div>
                </motion.div>
              ) : preview ? (
                <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="img-preview" style={{ maxWidth: '100%', aspectRatio: '16/9' }}>
                  <img src={preview} alt="Preview" />
                  <button className="img-remove" onClick={clearImage}><X size={14} /></button>
                </motion.div>
              ) : (
                <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="upload-zone" onClick={() => startCamera()}>
                    <Camera size={36} style={{ opacity: 0.4 }} />
                    <span><strong style={{ color: 'var(--text-secondary)' }}>Click to upload</strong> or drag and drop</span>
                    <span className="upload-hint">PNG, JPG or WebP (MAX. 10MB)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button type="button" onClick={() => startCamera()} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                      <Camera size={16} /> Camera
                    </button>
                    <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
                      <ImagePlus size={16} /> Gallery
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) pickImage(f); e.target.value = '' }} />
          </div>

          {/* ─── Mediator ─── */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={16} color="var(--accent)" />
              Mediator
            </label>
            <div className="chip-group" style={{ marginBottom: mediator === 'Others' ? 10 : 0 }}>
              {MEDIATORS.map(m => (
                <button
                  key={m}
                  className={`chip ${mediator === m ? 'active' : ''}`}
                  onClick={() => handleMediatorChange(m)}
                  type="button"
                >
                  {m}
                </button>
              ))}
            </div>
            {mediator === 'Others' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <input
                  className="field-input"
                  style={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}
                  value={otherName}
                  onChange={e => handleOtherNameChange(e.target.value)}
                  placeholder="Enter mediator name"
                  autoFocus
                />
              </motion.div>
            )}
          </div>

          {/* ─── Serial Number (auto-generated) ─── */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
              Serial Number
            </label>
            <div style={{ position: 'relative' }}>
              <Barcode size={18} color="var(--text-muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                className="field-input"
                style={{
                  width: '100%', paddingLeft: 42, fontSize: '1rem', fontWeight: 700,
                  background: serial ? 'var(--accent-light)' : 'var(--bg-input)',
                  color: serial ? 'var(--accent)' : 'var(--text-muted)',
                  letterSpacing: '0.02em'
                }}
                value={serialLoading ? 'Generating…' : serial}
                readOnly
                placeholder={!mediator ? 'Select mediator first' : 'Auto-generated'}
              />
              {serialLoading && (
                <Loader2 size={16} className="spin" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)' }} />
              )}
            </div>
          </div>

          {/* ─── Amount & Pledge Date ─── */}
          <div className="grid-2" style={{ marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
                Amount
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>₹</span>
                <input
                  className="field-input"
                  style={{ width: '100%', paddingLeft: 32, fontSize: '1rem', fontWeight: 600 }}
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
                Pledge Date
              </label>
              <input
                className="field-input"
                style={{ width: '100%' }}
                type="date"
                value={pledgeDate}
                onChange={e => setPledgeDate(e.target.value)}
              />
            </div>
          </div>

          {/* ─── Interest Rate ─── */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'block' }}>
              Interest Rate
            </label>
            <div style={{ position: 'relative' }}>
              <select
                className="field-input"
                style={{ width: '100%' }}
                value={rateOption}
                onChange={e => setRateOption(e.target.value)}
              >
                <option value="1">1% Monthly (12% Yearly)</option>
                <option value="1.15">1.15% Monthly (13.8% Yearly)</option>
                <option value="1.25">1.25% Monthly (15% Yearly)</option>
                <option value="custom">Custom Rate</option>
              </select>
            </div>
            {rateOption === 'custom' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 10 }}>
                <input
                  className="field-input"
                  style={{ width: '100%' }}
                  type="number"
                  inputMode="decimal"
                  value={customRate}
                  onChange={e => setCustomRate(e.target.value)}
                  placeholder="Enter custom rate (e.g. 1.5)"
                  step="0.01"
                  min="0"
                />
              </motion.div>
            )}
          </div>

          {/* ─── Submit ─── */}
          <motion.button
            className="btn btn-primary btn-lg btn-full"
            onClick={handleSubmit}
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            style={{ marginBottom: 40, borderRadius: 'var(--radius-xl)', fontSize: '1rem', fontWeight: 700, padding: '18px 32px' }}
          >
            {loading ? <Loader2 size={20} className="spin" /> : null}
            {loading ? 'Saving…' : 'Submit Pledge'}
          </motion.button>
        </motion.div>
      </main>
    </>
  )
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}
