import { supabase } from './supabaseClient'
import { isCloudinaryConfigured, uploadImageToCloudinary } from './cloudinaryClient'
import { isLocalImageRef, loadLocalImageBlob } from './localImageStore'

const QUEUE_KEY = 'pawnvault.pendingPledges'

export type PendingPledgePayload = {
  user_id: string
  serial_number: string
  mediator: string | null
  mediator_name: string | null
  item_type: string | null
  customer_name: string | null
  weight: number | null
  amount: number
  interest_rate: number
  pledge_date: string
  image_url: string | null
  status: 'active'
}

export type PendingPledge = {
  id: string
  createdAt: string
  payload: PendingPledgePayload
}

export function loadPendingPledges(): PendingPledge[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function enqueuePendingPledge(payload: PendingPledgePayload): PendingPledge {
  const entry: PendingPledge = {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    payload
  }
  const list = loadPendingPledges()
  list.push(entry)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
  return entry
}

export function removePendingPledge(id: string): void {
  const list = loadPendingPledges().filter(item => item.id !== id)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list))
}

export async function syncPendingPledges(): Promise<{ synced: number; failed: number }> {
  const { data: authData } = await supabase.auth.getUser()
  const currentUserId = authData.user?.id
  if (!currentUserId) return { synced: 0, failed: 0 }

  const list = loadPendingPledges()
  if (!list.length) return { synced: 0, failed: 0 }

  const userEntries = list.filter(entry => entry.payload.user_id === currentUserId)
  if (!userEntries.length) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const entry of userEntries) {
    try {
      const payload = await ensureCloudImageUrl(entry.payload)
      const { error } = await supabase.from('pawn_items').insert([payload])
      if (error) throw error
      removePendingPledge(entry.id)
      synced++
    } catch {
      failed++
    }
  }

  return { synced, failed }
}

async function ensureCloudImageUrl(payload: PendingPledgePayload): Promise<PendingPledgePayload> {
  if (!payload.image_url) return payload
  if (!isLocalImageRef(payload.image_url)) return payload
  if (!isCloudinaryConfigured()) return payload

  const blob = await loadLocalImageBlob(payload.image_url)
  if (!blob) return payload

  const fileName = `${payload.serial_number || 'pawn-item'}.jpg`
  const url = await uploadImageToCloudinary(blob, fileName)
  return { ...payload, image_url: url }
}
