import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'

const NATIVE_FOLDER_KEY = 'pawnvault.imageFolder'
const WEB_DIR_NAME_KEY = 'pawnvault.webImageDirName'
const WEB_SUBDIR_KEY = 'pawnvault.webImageSubdir'

const WEB_DB_NAME = 'pawnvault-image-store'
const WEB_DB_STORE = 'handles'
const WEB_DB_KEY = 'imagesDir'

const LOCAL_NATIVE_PREFIX = 'local-native:'
const LOCAL_WEB_PREFIX = 'local-web:'

const DEFAULT_NATIVE_FOLDER = 'PawnVault'
const NATIVE_BASE_PATH = 'Pictures'

const objectUrlCache = new Map<string, string>()

export type LocalImageResult = {
  localRef: string
  previewUrl: string
  fileName: string
}

export function isLocalImageRef(value: string | null): boolean {
  return !!value && (value.startsWith(LOCAL_NATIVE_PREFIX) || value.startsWith(LOCAL_WEB_PREFIX))
}

export function getNativeImageFolderName(): string {
  const stored = localStorage.getItem(NATIVE_FOLDER_KEY)
  return stored && stored.trim() ? stored.trim() : DEFAULT_NATIVE_FOLDER
}

export function setNativeImageFolderName(value: string): void {
  const trimmed = value.trim()
  localStorage.setItem(NATIVE_FOLDER_KEY, trimmed || DEFAULT_NATIVE_FOLDER)
}

export function getWebImageDirectoryName(): string {
  return localStorage.getItem(WEB_DIR_NAME_KEY) ?? ''
}

export function getWebImageSubdirName(): string {
  return localStorage.getItem(WEB_SUBDIR_KEY) ?? ''
}

export function setWebImageSubdirName(value: string): void {
  localStorage.setItem(WEB_SUBDIR_KEY, value.trim())
}

export async function pickWebImageDirectory(): Promise<string> {
  if (!('showDirectoryPicker' in window)) {
    throw new Error('Folder picker not supported in this browser')
  }

  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  await ensureWebHandlePermission(handle)
  await setWebHandle(handle)

  const name = handle?.name ?? ''
  localStorage.setItem(WEB_DIR_NAME_KEY, name)
  return name
}

export async function saveLocalImage(file: File, serialName: string): Promise<LocalImageResult> {
  const safeBase = sanitizeFileName(serialName)
  const extension = getFileExtension(file)
  const fileName = `${safeBase}.${extension}`

  if (Capacitor.isNativePlatform()) {
    const directory = Directory.ExternalStorage
    const folder = normalizeSubPath(getNativeImageFolderName())
    const path = [NATIVE_BASE_PATH, folder, fileName].filter(Boolean).join('/')

    await ensureNativePermissions()
    const base64 = await fileToBase64(file)
    await Filesystem.writeFile({
      path,
      data: base64,
      directory,
      recursive: true
    })

    const { uri } = await Filesystem.getUri({ directory, path })
    const previewUrl = Capacitor.convertFileSrc(uri)
    return { localRef: `${LOCAL_NATIVE_PREFIX}${path}`, previewUrl, fileName }
  }

  const handle = await getWebHandleOrThrow()
  const subdir = normalizeSubPath(getWebImageSubdirName())
  const pathParts = [subdir, fileName].filter(Boolean).join('/')
  const dirHandle = await getWebDirectoryHandleByPath(handle, subdir)
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(file)
  await writable.close()

  const previewUrl = URL.createObjectURL(file)
  cacheObjectUrl(`${LOCAL_WEB_PREFIX}${pathParts}`, previewUrl)
  return { localRef: `${LOCAL_WEB_PREFIX}${pathParts}`, previewUrl, fileName }
}

export async function renameLocalImage(localRef: string, serialName: string): Promise<LocalImageResult> {
  const extension = extractExtensionFromRef(localRef) ?? 'jpg'
  const newName = `${sanitizeFileName(serialName)}.${extension}`

  if (localRef.startsWith(LOCAL_NATIVE_PREFIX)) {
    const directory = Directory.ExternalStorage
    const oldPath = localRef.slice(LOCAL_NATIVE_PREFIX.length)
    const pathParts = oldPath.split('/')
    pathParts[pathParts.length - 1] = newName
    const newPath = pathParts.join('/')

    if (oldPath === newPath) {
      const { uri } = await Filesystem.getUri({ directory, path: oldPath })
      const previewUrl = Capacitor.convertFileSrc(uri)
      return { localRef, previewUrl, fileName: newName }
    }

    await ensureNativePermissions()
    await Filesystem.rename({ directory, from: oldPath, to: newPath })
    const { uri } = await Filesystem.getUri({ directory, path: newPath })
    const previewUrl = Capacitor.convertFileSrc(uri)
    return { localRef: `${LOCAL_NATIVE_PREFIX}${newPath}`, previewUrl, fileName: newName }
  }

  if (localRef.startsWith(LOCAL_WEB_PREFIX)) {
    const oldPath = localRef.slice(LOCAL_WEB_PREFIX.length)
    const segments = oldPath.split('/')
    const oldFileName = segments.pop() ?? ''
    const subdir = segments.join('/')
    const dirHandle = await getWebDirectoryHandleByPath(await getWebHandleOrThrow(), subdir)

    if (oldFileName === newName) {
      const resolved = await resolveLocalImageUrl(localRef)
      return { localRef, previewUrl: resolved ?? '', fileName: newName }
    }

    const oldHandle = await dirHandle.getFileHandle(oldFileName)
    const file = await oldHandle.getFile()
    const newHandle = await dirHandle.getFileHandle(newName, { create: true })
    const writable = await newHandle.createWritable()
    await writable.write(file)
    await writable.close()
    await dirHandle.removeEntry(oldFileName)

    const newPath = [subdir, newName].filter(Boolean).join('/')
    const previewUrl = URL.createObjectURL(file)
    cacheObjectUrl(`${LOCAL_WEB_PREFIX}${newPath}`, previewUrl)
    return { localRef: `${LOCAL_WEB_PREFIX}${newPath}`, previewUrl, fileName: newName }
  }

  throw new Error('Unsupported image reference')
}

export async function deleteLocalImage(localRef: string): Promise<void> {
  if (localRef.startsWith(LOCAL_NATIVE_PREFIX)) {
    const directory = Directory.ExternalStorage
    const path = localRef.slice(LOCAL_NATIVE_PREFIX.length)
    await ensureNativePermissions()
    await Filesystem.deleteFile({ directory, path })
    return
  }

  if (localRef.startsWith(LOCAL_WEB_PREFIX)) {
    const path = localRef.slice(LOCAL_WEB_PREFIX.length)
    const segments = path.split('/')
    const fileName = segments.pop() ?? ''
    const subdir = segments.join('/')
    const dirHandle = await getWebDirectoryHandleByPath(await getWebHandleOrThrow(), subdir)
    await dirHandle.removeEntry(fileName)
    return
  }
}

export async function resolveLocalImageUrl(localRef: string): Promise<string | null> {
  if (localRef.startsWith(LOCAL_NATIVE_PREFIX)) {
    const directory = Directory.ExternalStorage
    const path = localRef.slice(LOCAL_NATIVE_PREFIX.length)
    try {
      await ensureNativePermissions()
      const { uri } = await Filesystem.getUri({ directory, path })
      return Capacitor.convertFileSrc(uri)
    } catch {
      return null
    }
  }

  if (localRef.startsWith(LOCAL_WEB_PREFIX)) {
    const cached = objectUrlCache.get(localRef)
    if (cached) return cached

    const path = localRef.slice(LOCAL_WEB_PREFIX.length)
    const segments = path.split('/')
    const fileName = segments.pop() ?? ''
    const subdir = segments.join('/')

    try {
      const dirHandle = await getWebDirectoryHandleByPath(await getWebHandleOrThrow(), subdir)
      const fileHandle = await dirHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      const url = URL.createObjectURL(file)
      cacheObjectUrl(localRef, url)
      return url
    } catch {
      return null
    }
  }

  return null
}

export async function loadLocalImageBlob(localRef: string): Promise<Blob | null> {
  if (localRef.startsWith(LOCAL_NATIVE_PREFIX)) {
    const directory = Directory.ExternalStorage
    const path = localRef.slice(LOCAL_NATIVE_PREFIX.length)
    try {
      await ensureNativePermissions()
      const { data } = await Filesystem.readFile({ directory, path })
      const ext = extractExtensionFromRef(localRef)
      return base64ToBlob(String(data ?? ''), extensionToMime(ext))
    } catch {
      return null
    }
  }

  if (localRef.startsWith(LOCAL_WEB_PREFIX)) {
    const path = localRef.slice(LOCAL_WEB_PREFIX.length)
    const segments = path.split('/')
    const fileName = segments.pop() ?? ''
    const subdir = segments.join('/')

    try {
      const dirHandle = await getWebDirectoryHandleByPath(await getWebHandleOrThrow(), subdir)
      const fileHandle = await dirHandle.getFileHandle(fileName)
      const file = await fileHandle.getFile()
      return file
    } catch {
      return null
    }
  }

  return null
}

function cacheObjectUrl(localRef: string, url: string) {
  const existing = objectUrlCache.get(localRef)
  if (existing && existing !== url) {
    URL.revokeObjectURL(existing)
  }
  objectUrlCache.set(localRef, url)
}

function sanitizeFileName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '-')
  const cleaned = normalized.replace(/[^a-zA-Z0-9-_]/g, '-')
  return cleaned || 'image'
}

function getFileExtension(file: File): string {
  const fromName = file.name.split('.').pop()
  if (fromName && fromName.length <= 5) return fromName.toLowerCase()
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

function extractExtensionFromRef(localRef: string): string | null {
  const fileName = localRef.split('/').pop()
  if (!fileName) return null
  const ext = fileName.split('.').pop()
  return ext ? ext.toLowerCase() : null
}

function extensionToMime(ext: string | null): string {
  if (!ext) return 'application/octet-stream'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}

function normalizeSubPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

async function ensureNativePermissions(): Promise<void> {
  const permissions = await Filesystem.checkPermissions()
  if (permissions.publicStorage !== 'granted') {
    const request = await Filesystem.requestPermissions()
    if (request.publicStorage !== 'granted') {
      throw new Error('Storage permission required')
    }
  }
}

async function getWebHandleOrThrow(): Promise<any> {
  const handle = await getWebHandle()
  if (!handle) throw new Error('Choose a folder to save images')
  await ensureWebHandlePermission(handle)
  return handle
}

async function getWebHandle(): Promise<any | null> {
  if (!('indexedDB' in window)) return null
  const db = await openWebDb()
  return new Promise(resolve => {
    const tx = db.transaction(WEB_DB_STORE, 'readonly')
    const store = tx.objectStore(WEB_DB_STORE)
    const req = store.get(WEB_DB_KEY)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => resolve(null)
  })
}

async function setWebHandle(handle: any): Promise<void> {
  const db = await openWebDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WEB_DB_STORE, 'readwrite')
    const store = tx.objectStore(WEB_DB_STORE)
    const req = store.put(handle, WEB_DB_KEY)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function openWebDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WEB_DB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function ensureWebHandlePermission(handle: any): Promise<void> {
  if (!handle?.queryPermission) return
  const opts = { mode: 'readwrite' }
  const perm = await handle.queryPermission(opts)
  if (perm === 'granted') return
  const request = await handle.requestPermission(opts)
  if (request !== 'granted') throw new Error('Storage permission required')
}

async function getWebDirectoryHandleByPath(base: any, subdir: string): Promise<any> {
  let current = base
  const parts = subdir ? subdir.split('/').filter(Boolean) : []
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true })
  }
  return current
}
