import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Capacitor } from '@capacitor/core'
import {
  ArrowLeft, Camera, ImagePlus, X, Barcode, IndianRupee, Calendar, ChevronDown, Loader2,
  SwitchCamera, Aperture, Users, Edit3, Trash2, CheckCircle, Gem
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import { isCloudinaryConfigured, uploadImageToCloudinary } from '../services/cloudinaryClient'
import { compressImageToTarget } from '../services/imageCompression'
import ResolvedImage from '../components/ResolvedImage'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useVerifyAuth } from '../hooks/useVerifyAuth'
import { useAuth } from '../contexts/AuthContext'
import { enqueuePendingPledge } from '../services/pendingPledgeQueue'
import {
  deleteLocalImage,
  getNativeImageFolderName,
  getWebImageDirectoryName,
  getWebImageSubdirName,
  isLocalImageRef,
  pickWebImageDirectory,
  renameLocalImage,
  resolveLocalImageUrl,
  saveLocalImage,
  setNativeImageFolderName,
  setWebImageSubdirName
} from '../services/localImageStore'

const MEDIATORS = ['Jagadesh', 'Murali', 'Others'] as const
type MediatorOption = typeof MEDIATORS[number]

const SUPER_RATE_VALUES = ['1', '1.15', '1.25'] as const
const NORMAL_RATE_VALUES = ['1.5', '2', '3', '5'] as const

const SUPER_RATE_OPTIONS = [
  { value: '1', label: '1% Monthly (12% Yearly)' },
  { value: '1.15', label: '1.15% Monthly (13.8% Yearly)' },
  { value: '1.25', label: '1.25% Monthly (15% Yearly)' },
  { value: 'custom', label: 'Custom Rate' },
] as const

const NORMAL_RATE_OPTIONS = [
  { value: '1.5', label: '1.5% Monthly (18% Yearly)' },
  { value: '2', label: '2% Monthly (24% Yearly)' },
  { value: '3', label: '3% Monthly (36% Yearly)' },
  { value: '5', label: '5% Monthly (60% Yearly)' },
  { value: 'custom', label: 'Custom Rate' },
] as const

const IMAGE_TARGET_BYTES = 200 * 1024

export default function AddItem() {
  const navigate = useNavigate()
  const { isSuperUser } = useAuth()
  const isOnline = useOnlineStatus()
  const { verify, modal: authModal } = useVerifyAuth()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id')
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isNative = Capacitor.isNativePlatform()

  const [nativeFolder, setNativeFolder] = useState(getNativeImageFolderName())
  const [webDirName, setWebDirName] = useState(getWebImageDirectoryName())
  const [webSubdir, setWebSubdir] = useState(getWebImageSubdirName())
  const [localImageRef, setLocalImageRef] = useState<string | null>(null)
  const [localImageName, setLocalImageName] = useState<string | null>(null)
  const [savingLocalImage, setSavingLocalImage] = useState(false)
  const lastSerialRef = useRef('')

  // Callback ref: attaches stream the instant the <video> element mounts
  const videoCallbackRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node
    if (node && streamRef.current) {
      node.srcObject = streamRef.current
      node.addEventListener('loadedmetadata', () => { node.play().catch(() => {}) }, { once: true })
      if (node.readyState >= 1) node.play().catch(() => {})
    }
  }, [])

  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(!!editId)
  const [serialLoading, setSerialLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [savedItem, setSavedItem] = useState<{ id: string; serial_number: string; amount: number; pledge_date: string; interest_rate: number; mediator_name: string; image_url: string | null; customer_name?: string; item_type?: string; weight?: number | null } | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [queuedOffline, setQueuedOffline] = useState(false)

  const [serial, setSerial] = useState('')
  const [serialPrefix, setSerialPrefix] = useState('')
  const [serialStatus, setSerialStatus] = useState<'ok' | 'exists-active' | 'exists-released' | ''>('')
  const [amount, setAmount] = useState('')
  const [weight, setWeight] = useState('')
  const defaultRateOption = isSuperUser ? '1' : '1.5'
  const [rateOption, setRateOption] = useState<string>(defaultRateOption)
  const [customRate, setCustomRate] = useState('')
  const [pledgeDate, setPledgeDate] = useState(todayStr())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [mediator, setMediator] = useState<MediatorOption | ''>('')
  const [otherName, setOtherName] = useState('')

  // Non-super-user fields
  const [itemType, setItemType] = useState<'Gold' | 'Silver' | 'Other' | ''>('')
  const [customerName, setCustomerName] = useState('')

  const [cameraOpen, setCameraOpen] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')

  // ─── Load existing item for editing (when navigating from Items page) ───
  useEffect(() => {
    if (!editId) return
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('pawn_items')
          .select('*')
          .eq('id', editId)
          .single()
        if (error || !data) { toast.error('Item not found'); navigate('/items'); return }

        // Populate form fields
        setSerial(data.serial_number)
        setAmount(String(data.amount))
        setPledgeDate(data.pledge_date)
        if (data.image_url) {
          if (isLocalImageRef(data.image_url)) {
            const resolved = await resolveLocalImageUrl(data.image_url)
            if (resolved) setPreview(resolved)
            setLocalImageRef(data.image_url)
            setLocalImageName(data.image_url.split('/').pop() ?? null)
          } else {
            setPreview(data.image_url)
          }
        }

        // Set rate
        const r = String(data.interest_rate)
        const allowedRates = (isSuperUser ? SUPER_RATE_VALUES : NORMAL_RATE_VALUES) as readonly string[]
        if (allowedRates.includes(r)) {
          setRateOption(r)
        } else {
          setRateOption('custom')
          setCustomRate(r)
        }

        if (data.weight !== null && data.weight !== undefined) {
          setWeight(String(data.weight))
        }

        // Set mediator
        if (data.mediator === 'Jagadesh' || data.mediator === 'Murali') {
          setMediator(data.mediator as MediatorOption)
        } else if (data.mediator === 'Others') {
          setMediator('Others')
          setOtherName(data.mediator_name ?? '')
        }

        // Set non-super-user fields
        if (data.item_type) setItemType(data.item_type as 'Gold' | 'Silver' | 'Other')
        if (data.customer_name) setCustomerName(data.customer_name)

        setSavedItem({
          id: data.id,
          serial_number: data.serial_number,
          amount: data.amount,
          pledge_date: data.pledge_date,
          interest_rate: data.interest_rate,
          mediator_name: data.mediator_name ?? '',
          image_url: data.image_url,
          customer_name: data.customer_name ?? '',
          item_type: data.item_type ?? '',
          weight: data.weight ?? null,
        })
        setEditMode(true)
        setQueuedOffline(false)
      } catch {
        toast.error('Failed to load item')
        navigate('/items')
      } finally {
        setInitialLoading(false)
      }
    })()
  }, [editId, isSuperUser])

  useEffect(() => {
    if (!isSuperUser) setNativeImageFolderName(nativeFolder)
  }, [nativeFolder, isSuperUser])

  useEffect(() => {
    if (!isSuperUser) setWebImageSubdirName(webSubdir)
  }, [webSubdir, isSuperUser])

  useEffect(() => {
    if (isSuperUser || !localImageRef || savingLocalImage) return
    const currentSerial = serial.trim()
    if (!currentSerial) return
    if (lastSerialRef.current === currentSerial) return

    lastSerialRef.current = currentSerial
    setSavingLocalImage(true)
    renameLocalImage(localImageRef, currentSerial)
      .then(result => {
        setLocalImageRef(result.localRef)
        setLocalImageName(result.fileName)
        if (result.previewUrl) setPreview(result.previewUrl)
      })
      .catch(() => {
        toast.error('Failed to rename image file')
      })
      .finally(() => setSavingLocalImage(false))
  }, [serial, localImageRef, isSuperUser, savingLocalImage])

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
      setSerialPrefix(prefix)
      setSerialStatus('')
    } catch {
      toast.error('Failed to generate serial number')
    } finally {
      setSerialLoading(false)
    }
  }, [])

  const handleMediatorChange = (value: MediatorOption | '') => {
    setMediator(value)
    setSerialStatus('')
    if (value !== 'Others') {
      setOtherName('')
      generateSerial(value, '')
    } else {
      setSerial('')
      setSerialPrefix('')
    }
  }

  const handleOtherNameChange = (name: string) => {
    setOtherName(name)
    setSerialStatus('')
    if (name.trim()) {
      generateSerial('Others', name)
    } else {
      setSerial('')
      setSerialPrefix('')
    }
  }

  // ─── Manual serial number editing (prefix locked, number editable) ───
  const handleSerialChange = (value: string) => {
    if (!serialPrefix) return
    // Ensure prefix is always present
    if (!value.startsWith(serialPrefix)) return
    setSerial(value)
    setSerialStatus('')
  }

  // ─── Check for duplicate serial number in DB ───
  useEffect(() => {
    if (!serial || !serialPrefix || serialLoading) { setSerialStatus(''); return }
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('pawn_items')
          .select('id, status')
          .eq('serial_number', serial.trim())
        if (data && data.length > 0) {
          // Skip if editing the same item
          if (editId && data.length === 1 && data[0].id === editId) {
            setSerialStatus('ok')
            return
          }
          const hasActive = data.some(d => d.status === 'active')
          setSerialStatus(hasActive ? 'exists-active' : 'exists-released')
        } else {
          setSerialStatus('ok')
        }
      } catch { setSerialStatus('') }
    }, 400)
    return () => clearTimeout(timer)
  }, [serial, serialPrefix, serialLoading, editId])

  // ─── Serial generation for non-super-users (Gold/Silver/Other) ───
  const generateSerialByType = useCallback(async (type: 'Gold' | 'Silver' | 'Other') => {
    setSerialLoading(true)
    try {
      const prefix = type === 'Gold' ? 'G' : type === 'Silver' ? 'S' : 'O'
      const pattern = `${prefix}%`

      const { data } = await supabase
        .from('pawn_items')
        .select('serial_number')
        .like('serial_number', pattern)
        .order('created_at', { ascending: false })

      let maxNum = 0
      if (data && data.length > 0) {
        for (const row of data) {
          const match = row.serial_number.match(new RegExp(`^${prefix}(\\d+)$`))
          if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10))
        }
      }

      setSerial(`${prefix}${maxNum + 1}`)
      setSerialPrefix(prefix)
      setSerialStatus('')
    } catch {
      toast.error('Failed to generate serial number')
    } finally {
      setSerialLoading(false)
    }
  }, [])

  const handleItemTypeChange = (type: 'Gold' | 'Silver' | 'Other') => {
    setItemType(type)
    setSerialStatus('')
    generateSerialByType(type)
  }

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    }
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
      // If video element is already mounted (camera flip), attach directly
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.addEventListener('loadedmetadata', () => { videoRef.current?.play().catch(() => {}) }, { once: true })
        if (videoRef.current.readyState >= 1) videoRef.current.play().catch(() => {})
      }
      setCameraOpen(true)
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

  // Fallback: attach stream via effect in case callback ref fires before stream is ready
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.addEventListener('loadedmetadata', () => { videoRef.current?.play().catch(() => {}) }, { once: true })
      if (videoRef.current.readyState >= 1) videoRef.current.play().catch(() => {})
    }
  }, [cameraOpen])

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
    }, 'image/jpeg', 0.92)
  }

  const pickImage = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Max image size is 10 MB'); return }
    setSavingLocalImage(true)
    try {
      let compressed = file
      try {
        compressed = await compressImageToTarget(file, IMAGE_TARGET_BYTES)
      } catch {
        compressed = file
      }

      setImageFile(compressed)

      if (isSuperUser) {
        setPreview(URL.createObjectURL(compressed))
        return
      }

      if (localImageRef) {
        try { await deleteLocalImage(localImageRef) } catch { /* ignore */ }
      }

      const name = serial.trim() || `temp-${Date.now()}`
      const saved = await saveLocalImage(compressed, name)
      setLocalImageRef(saved.localRef)
      setLocalImageName(saved.fileName)
      setPreview(saved.previewUrl)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save image'
      toast.error(message)
      setPreview(URL.createObjectURL(file))
    } finally {
      setSavingLocalImage(false)
    }
  }

  const clearImage = async () => {
    setImageFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)

    if (!isSuperUser && localImageRef) {
      try { await deleteLocalImage(localImageRef) } catch { /* ignore */ }
      setLocalImageRef(null)
      setLocalImageName(null)
    }
  }

  const handlePickWebFolder = async () => {
    try {
      const name = await pickWebImageDirectory()
      setWebDirName(name)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Folder selection failed'
      toast.error(message)
    }
  }

  const handleSubmit = async () => {
    if (isSuperUser) {
      if (!mediator) { toast.error('Select a mediator'); return }
      if (mediator === 'Others' && !otherName.trim()) { toast.error('Enter mediator name'); return }
    } else {
      if (!itemType) { toast.error('Select item type'); return }
      if (!customerName.trim()) { toast.error('Enter customer name'); return }
      if (!imageFile && !preview) { toast.error('Photo is required'); return }
    }
    if (!serial.trim()) { toast.error('Serial number not generated'); return }
    if (!isSuperUser && savingLocalImage) { toast.error('Image is still saving'); return }
    if (serialStatus === 'exists-active') { toast.error('Serial number already in use (active pledge)'); return }
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return }
    if (!isSuperUser && !isNative && !webDirName) {
      toast.error('Choose a folder to save images')
      return
    }
    const weightValue = weight.trim() ? Number(weight) : null
    if (weightValue !== null && (!Number.isFinite(weightValue) || weightValue <= 0)) {
      toast.error('Enter a valid weight')
      return
    }

    let rate = Number(rateOption)
    if (rateOption === 'custom') {
      rate = Number(customRate)
      if (!rate || rate <= 0) { toast.error('Enter a valid custom rate'); return }
    }

    const mediatorName = mediator === 'Others' ? otherName.trim() : mediator

    setLoading(true)
    try {
      let imageUrl: string | null = null

      const cloudinaryReady = isCloudinaryConfigured()
      if (imageFile && cloudinaryReady && isOnline) {
        imageUrl = await uploadImageToCloudinary(imageFile, serial.trim() || 'pawn-item')
      }

      if (!imageUrl) {
        if (!isSuperUser) {
          if (localImageRef) {
            imageUrl = localImageRef
          } else if (imageFile) {
            const saved = await saveLocalImage(imageFile, serial.trim())
            imageUrl = saved.localRef
            setLocalImageRef(saved.localRef)
            setLocalImageName(saved.fileName)
            setPreview(saved.previewUrl)
          }
        } else if (imageFile) {
          if (!cloudinaryReady) {
            throw new Error('Cloudinary is not configured')
          }
          if (!isOnline) {
            throw new Error('You are offline. Connect to upload images')
          }
        }
      }

      if (!isSuperUser && !imageUrl) {
        toast.error('Photo is required')
        return
      }

      const payload = {
        serial_number: serial.trim(),
        mediator: isSuperUser ? mediator : null,
        mediator_name: isSuperUser ? mediatorName : null,
        item_type: isSuperUser ? null : itemType,
        customer_name: isSuperUser ? null : customerName.trim(),
        weight: weightValue,
        amount: Number(amount),
        interest_rate: rate,
        pledge_date: pledgeDate,
        image_url: imageUrl,
        status: 'active' as const
      }

      if (!isSuperUser && !isOnline) {
        const queued = enqueuePendingPledge(payload)
        toast.success('Saved offline — will sync when online')
        setQueuedOffline(true)
        setSavedItem({
          id: queued.id,
          serial_number: serial.trim(),
          amount: Number(amount),
          pledge_date: pledgeDate,
          interest_rate: rate,
          mediator_name: isSuperUser ? mediatorName : '',
          image_url: imageUrl,
          customer_name: isSuperUser ? undefined : customerName.trim(),
          item_type: isSuperUser ? undefined : itemType,
          weight: weightValue,
        })
        setEditMode(false)
        return
      }

      const { data: inserted, error } = await supabase.from('pawn_items').insert([payload]).select().single()

      if (error) {
        if (error.code === '23505') { toast.error('Serial number already exists'); return }
        if (!isSuperUser && !navigator.onLine) {
          const queued = enqueuePendingPledge(payload)
          toast.success('Saved offline — will sync when online')
          setQueuedOffline(true)
          setSavedItem({
            id: queued.id,
            serial_number: serial.trim(),
            amount: Number(amount),
            pledge_date: pledgeDate,
            interest_rate: rate,
            mediator_name: isSuperUser ? mediatorName : '',
            image_url: imageUrl,
            customer_name: isSuperUser ? undefined : customerName.trim(),
            item_type: isSuperUser ? undefined : itemType,
            weight: weightValue,
          })
          setEditMode(false)
          return
        }
        throw error
      }

      toast.success('Item pledged successfully')
      setQueuedOffline(false)
      setSavedItem({
        id: inserted.id,
        serial_number: serial.trim(),
        amount: Number(amount),
        pledge_date: pledgeDate,
        interest_rate: rate,
        mediator_name: isSuperUser ? mediatorName : '',
        image_url: imageUrl,
        customer_name: isSuperUser ? undefined : customerName.trim(),
        item_type: isSuperUser ? undefined : itemType,
        weight: weightValue,
      })
      setEditMode(false)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = async () => {
    const verified = await verify('Authenticate to edit this pledge')
    if (!verified) {
      toast.error('Biometric verification failed')
      return
    }
    setEditMode(true)
  }

  const handleUpdate = async () => {
    if (!savedItem) return
    if (!amount || Number(amount) <= 0) { toast.error('Enter a valid amount'); return }
    const weightValue = weight.trim() ? Number(weight) : null
    if (weightValue !== null && (!Number.isFinite(weightValue) || weightValue <= 0)) {
      toast.error('Enter a valid weight')
      return
    }
    if (!isSuperUser && !isOnline) {
      toast.error('You are offline. Update when back online.')
      return
    }

    let rate = Number(rateOption)
    if (rateOption === 'custom') {
      rate = Number(customRate)
      if (!rate || rate <= 0) { toast.error('Enter a valid custom rate'); return }
    }

    setLoading(true)
    try {
      let imageUrl = savedItem.image_url

      if (imageFile) {
        imageUrl = null
        const cloudinaryReady = isCloudinaryConfigured()
        if (cloudinaryReady && isOnline) {
          imageUrl = await uploadImageToCloudinary(imageFile, serial.trim() || savedItem.serial_number)
        }

        if (!imageUrl) {
          if (!isSuperUser) {
            if (localImageRef) {
              imageUrl = localImageRef
            } else {
              const saved = await saveLocalImage(imageFile, serial.trim())
              imageUrl = saved.localRef
              setLocalImageRef(saved.localRef)
              setLocalImageName(saved.fileName)
              setPreview(saved.previewUrl)
            }
          } else {
            if (!cloudinaryReady) {
              throw new Error('Cloudinary is not configured')
            }
            if (!isOnline) {
              throw new Error('You are offline. Connect to upload images')
            }
          }
        }
      }

      const updateData: Record<string, unknown> = {
        amount: Number(amount),
        weight: weightValue,
        interest_rate: rate,
        pledge_date: pledgeDate,
        image_url: imageUrl
      }
      if (!isSuperUser) {
        updateData.customer_name = customerName.trim()
      }

      const { error } = await supabase.from('pawn_items')
        .update(updateData)
        .eq('id', savedItem.id)

      if (error) throw error

      toast.success('Item updated successfully')
      setSavedItem({ ...savedItem, amount: Number(amount), weight: weightValue, interest_rate: rate, pledge_date: pledgeDate, image_url: imageUrl })
      setEditMode(false)
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update item')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!savedItem) return
    const verified = await verify('Authenticate to delete this pledge')
    if (!verified) {
      toast.error('Biometric verification failed')
      return
    }
    setDeleting(true)
    try {
      const { error } = await supabase.from('pawn_items').delete().eq('id', savedItem.id)
      if (error) throw error
      toast.success('Item deleted successfully')
      navigate('/items')
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete item')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button className="topbar-back" onClick={() => navigate(editId ? '/items' : '/')}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">{savedItem && !editMode ? 'Pledge Added' : editMode ? 'Edit Pledge' : 'Add New Pledge'}</span>
        </div>
      </header>

      {/* Blue divider line */}
      <div style={{ height: 3, background: 'var(--accent)' }} />

      <main className="page-shell" style={{ paddingTop: 24 }}>
        {/* ─── Initial Loading (editing existing item) ─── */}
        {initialLoading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>
            <Loader2 size={28} className="spin" />
            <div style={{ marginTop: 12, fontSize: '0.875rem' }}>Loading item…</div>
          </div>
        ) : (
        <>
        {/* ─── Success Screen ─── */}
        {savedItem && !editMode ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            style={{ maxWidth: 560, margin: '0 auto' }}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <CheckCircle size={56} color="var(--accent)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Pledge Saved!
              </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
              {savedItem.image_url && (
                <div style={{ marginBottom: 16, borderRadius: 'var(--radius-md)', overflow: 'hidden', maxHeight: 200 }}>
                  <ResolvedImage src={savedItem.image_url} alt="" style={{ width: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div className="detail-row" style={{ padding: '8px 0' }}>
                <span className="detail-key">Serial</span>
                <span className="detail-val" style={{ fontWeight: 700 }}>#{savedItem.serial_number}</span>
              </div>
              {isSuperUser ? (
                <div className="detail-row" style={{ padding: '8px 0' }}>
                  <span className="detail-key">Mediator</span>
                  <span className="detail-val">{savedItem.mediator_name}</span>
                </div>
              ) : (
                <>
                  <div className="detail-row" style={{ padding: '8px 0' }}>
                    <span className="detail-key">Type</span>
                    <span className="detail-val">{savedItem.item_type}</span>
                  </div>
                  <div className="detail-row" style={{ padding: '8px 0' }}>
                    <span className="detail-key">Customer</span>
                    <span className="detail-val">{savedItem.customer_name}</span>
                  </div>
                </>
              )}
              <div className="detail-row" style={{ padding: '8px 0' }}>
                <span className="detail-key">Amount</span>
                <span className="detail-val" style={{ fontWeight: 700, color: 'var(--accent)' }}>₹{savedItem.amount.toLocaleString('en-IN')}</span>
              </div>
              {!isSuperUser && savedItem.weight !== null && savedItem.weight !== undefined && (
                <div className="detail-row" style={{ padding: '8px 0' }}>
                  <span className="detail-key">Weight</span>
                  <span className="detail-val">{Number(savedItem.weight).toLocaleString('en-IN')} g</span>
                </div>
              )}
              <div className="detail-row" style={{ padding: '8px 0' }}>
                <span className="detail-key">Rate</span>
                <span className="detail-val">{savedItem.interest_rate}% / month</span>
              </div>
              <div className="detail-row" style={{ padding: '8px 0' }}>
                <span className="detail-key">Pledge Date</span>
                <span className="detail-val">{(() => { const dt = new Date(savedItem.pledge_date); return `${String(dt.getDate()).padStart(2,'0')}-${String(dt.getMonth()+1).padStart(2,'0')}-${dt.getFullYear()}` })()}</span>
              </div>
            </div>

            {queuedOffline && (
              <div className="card" style={{ marginBottom: 16, padding: 12, background: 'var(--warning-bg)', borderColor: 'var(--warning)' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--warning)' }}>
                  Saved offline — this pledge will sync when you are back online.
                </div>
              </div>
            )}

            {!queuedOffline && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <motion.button
                  className="btn btn-full"
                  onClick={handleEdit}
                  whileTap={{ scale: 0.97 }}
                  style={{ flex: 1, borderRadius: 'var(--radius-xl)', fontSize: '0.9375rem', fontWeight: 700, padding: '14px 20px', background: 'var(--accent)', color: 'white' }}
                >
                  <Edit3 size={18} /> Edit
                </motion.button>
                <motion.button
                  className="btn btn-full"
                  onClick={handleDelete}
                  disabled={deleting}
                  whileTap={{ scale: 0.97 }}
                  style={{ flex: 1, borderRadius: 'var(--radius-xl)', fontSize: '0.9375rem', fontWeight: 700, padding: '14px 20px', background: '#ef4444', color: 'white' }}
                >
                  {deleting ? <Loader2 size={18} className="spin" /> : <Trash2 size={18} />}
                  {deleting ? 'Deleting…' : 'Delete'}
                </motion.button>
              </div>
            )}

            <motion.button
              className="btn btn-ghost btn-full"
              onClick={() => navigate('/items')}
              whileTap={{ scale: 0.97 }}
              style={{ borderRadius: 'var(--radius-xl)', fontSize: '0.9375rem', fontWeight: 600, padding: '14px 20px', marginBottom: 40 }}
            >
              Back to Items
            </motion.button>
          </motion.div>
        ) : (
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
                    ref={videoCallbackRef}
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

          {!isSuperUser && (
            <div className="card" style={{ marginBottom: 20, padding: 14 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginBottom: 10 }}>
                Image Storage
              </div>
              {isNative ? (
                <>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                    Gallery Folder Path
                  </label>
                  <input
                    className="field-input"
                    style={{ width: '100%' }}
                    value={nativeFolder}
                    onChange={e => setNativeFolder(e.target.value)}
                    placeholder="PawnVault"
                  />
                  <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Saved to: Pictures/{nativeFolder || 'PawnVault'}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={handlePickWebFolder}>
                      Choose Folder
                    </button>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {webDirName ? `Selected: ${webDirName}` : 'No folder selected'}
                    </span>
                  </div>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, display: 'block' }}>
                    Subfolder (optional)
                  </label>
                  <input
                    className="field-input"
                    style={{ width: '100%' }}
                    value={webSubdir}
                    onChange={e => setWebSubdir(e.target.value)}
                    placeholder="PawnVault"
                  />
                </>
              )}
              <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Images are saved using the serial number (e.g. {serial.trim() || 'SERIAL'}.jpg).
              </div>
            </div>
          )}

          {/* ─── Mediator (super user) or Item Type + Customer Name (others) ─── */}
          {isSuperUser ? (
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
          ) : (
          <>
            {/* Item Type */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Gem size={16} color="var(--accent)" />
                Item Type
              </label>
              <div className="chip-group">
                {(['Gold', 'Silver', 'Other'] as const).map(t => (
                  <button
                    key={t}
                    className={`chip ${itemType === t ? 'active' : ''}`}
                    onClick={() => handleItemTypeChange(t)}
                    type="button"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Users size={16} color="var(--accent)" />
                Customer Name
              </label>
              <input
                className="field-input"
                style={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Enter customer name"
              />
            </div>
          </>
          )}

          {/* ─── Serial Number (prefix locked, number editable) ─── */}
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
                  background: serialStatus === 'exists-active' ? '#fef2f2' : serialStatus === 'exists-released' ? '#fffbeb' : serial ? 'var(--accent-light)' : 'var(--bg-input)',
                  color: serialStatus === 'exists-active' ? '#dc2626' : serialStatus === 'exists-released' ? '#d97706' : serial ? 'var(--accent)' : 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  borderColor: serialStatus === 'exists-active' ? '#dc2626' : serialStatus === 'exists-released' ? '#d97706' : undefined
                }}
                value={serialLoading ? 'Generating…' : serial}
                onChange={e => handleSerialChange(e.target.value)}
                readOnly={!serialPrefix || serialLoading}
                placeholder={isSuperUser ? (!mediator ? 'Select mediator first' : 'Auto-generated') : (!itemType ? 'Select item type first' : 'Auto-generated')}
              />
              {serialLoading && (
                <Loader2 size={16} className="spin" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent)' }} />
              )}
            </div>
            {serialStatus === 'exists-active' && (
              <div style={{ marginTop: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                ⚠ This serial number already exists (active pledge)
              </div>
            )}
            {serialStatus === 'exists-released' && (
              <div style={{ marginTop: 6, fontSize: '0.8125rem', fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: 4 }}>
                ⚠ This serial number exists (released entry)
              </div>
            )}
            {serialPrefix && !serialLoading && (
              <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Prefix "{serialPrefix}" is locked — change the number after it
              </div>
            )}
          </div>

          {/* ─── Amount, Weight & Pledge Date ─── */}
          {isSuperUser ? (
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
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div className="grid-2" style={{ marginBottom: 16 }}>
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
                    Weight (g)
                  </label>
                  <input
                    className="field-input"
                    style={{ width: '100%', fontSize: '1rem', fontWeight: 600 }}
                    type="number"
                    inputMode="decimal"
                    value={weight}
                    onChange={e => setWeight(e.target.value)}
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
          )}

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
                {(isSuperUser ? SUPER_RATE_OPTIONS : NORMAL_RATE_OPTIONS).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
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
            onClick={editMode ? handleUpdate : handleSubmit}
            disabled={loading || savingLocalImage}
            whileTap={{ scale: 0.97 }}
            style={{ marginBottom: 40, borderRadius: 'var(--radius-xl)', fontSize: '1rem', fontWeight: 700, padding: '18px 32px' }}
          >
            {loading ? <Loader2 size={20} className="spin" /> : null}
            {loading ? (editMode ? 'Updating…' : 'Saving…') : (editMode ? 'Update Pledge' : 'Submit Pledge')}
          </motion.button>
        </motion.div>
        )}
        </>
        )}
      </main>
      {authModal}
    </>
  )
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}
