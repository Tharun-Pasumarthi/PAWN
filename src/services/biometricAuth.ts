/**
 * User registration + edit/delete protection.
 *
 * Flow:
 * 1. Register a user — stores name in localStorage (Settings gate required via TOTP first)
 * 2. Authenticate — uses device fingerprint/face ID via native biometric plugin.
 *    Falls back to TOTP code prompt if biometric hardware is unavailable.
 */

// ─── Native biometric (Capacitor) ───
type NativeBiometricPlugin = typeof import('capacitor-native-biometric').NativeBiometric

async function getNativeBiometric(): Promise<NativeBiometricPlugin | null> {
  try {
    const mod = await import('capacitor-native-biometric')
    return mod.NativeBiometric
  } catch {
    return null
  }
}

// ─── User-scoped localStorage (multi-tenant) ───
let _activeUserId = ''

/** Called by AuthContext to namespace localStorage per shop account */
export function setActiveUserId(id: string) { _activeUserId = id }

function scopedKey(base: string): string {
  return _activeUserId ? `${base}_${_activeUserId}` : base
}

const STORAGE_KEY_BASE = 'pawnvault_bio_users'

export interface BioUser {
  name: string
  credentialId: string        // base64-encoded credential raw ID
  registeredAt: string        // ISO date
}

// ─── Helpers ───

function getUsers(): BioUser[] {
  try {
    return JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY_BASE)) || '[]')
  } catch { return [] }
}

function saveUsers(users: BioUser[]) {
  localStorage.setItem(scopedKey(STORAGE_KEY_BASE), JSON.stringify(users))
}

// ─── Public API ───

/** @deprecated No longer used directly — use requestBiometricAuth instead */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const NativeBiometric = await getNativeBiometric()
    if (!NativeBiometric) return false
    const result = await NativeBiometric.isAvailable()
    return result.isAvailable
  } catch {
    return false
  }
}

/** Get all registered biometric users */
export function getRegisteredUsers(): BioUser[] {
  return getUsers()
}

/** Check if any users are registered */
export function hasRegisteredUsers(): boolean {
  return getUsers().length > 0
}

/**
 * Register a new authorized user by name.
 * No device credential required — access is controlled by the TOTP gate in Settings.
 */
export async function registerUser(name: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Name is required' }

  const existing = getUsers()
  if (existing.some(u => u.name.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: 'A user with this name is already registered' }
  }

  const newUser: BioUser = {
    name: trimmed,
    credentialId: '',
    registeredAt: new Date().toISOString()
  }
  saveUsers([...existing, newUser])
  return { success: true }
}

/** Remove a registered user */
export function removeUser(name: string): boolean {
  const users = getUsers()
  const filtered = users.filter(u => u.name !== name)
  if (filtered.length === users.length) return false
  saveUsers(filtered)
  return true
}

/**
 * Verify identity via device biometric (fingerprint / Face ID).
 * Falls back to TOTP code prompt if biometric is not available.
 * Returns 'authenticated' on success, null on failure/cancel.
 */
export async function authenticateUser(): Promise<string | null> {
  try {
    const NativeBiometric = await getNativeBiometric()
    if (!NativeBiometric) throw new Error('Native biometric unavailable')
    const { isAvailable } = await NativeBiometric.isAvailable()
    if (isAvailable) {
      await NativeBiometric.verifyIdentity({
        title: 'Authentication Required',
        subtitle: 'Verify your identity to continue',
        negativeButtonText: 'Cancel',
        maxAttempts: 3
      })
      return 'authenticated'
    }
  } catch (err: any) {
    // User cancelled or biometric failed — do not fall through to TOTP
    return null
  }
  // Biometric hardware not present — fall back to TOTP
  const stored = localStorage.getItem(scopedKey('pawnvault_totp_secret'))
  if (!stored) return null
  const code = window.prompt('Enter your 6-digit authenticator code:')
  if (!code) return null
  return verifyTotpCode(code.trim()) ? 'authenticated' : null
}

/**
 * Prompt device biometric and return success boolean.
 * Falls back to TOTP code prompt if biometric hardware unavailable.
 */
export async function requestBiometricAuth(reason: string = 'Verify your identity'): Promise<boolean> {
  try {
    const NativeBiometric = await getNativeBiometric()
    if (!NativeBiometric) throw new Error('Native biometric unavailable')
    const { isAvailable } = await NativeBiometric.isAvailable()
    if (isAvailable) {
      await NativeBiometric.verifyIdentity({
        title: 'Authentication Required',
        subtitle: reason,
        negativeButtonText: 'Cancel',
        maxAttempts: 3
      })
      return true
    }
  } catch {
    // User cancelled or failed — deny
    return false
  }
  // Biometric hardware not present — fall back to TOTP
  const stored = localStorage.getItem(scopedKey('pawnvault_totp_secret'))
  if (!stored) return false
  const code = window.prompt(`${reason}\n\nEnter your 6-digit authenticator code:`)
  if (!code) return false
  return verifyTotpCode(code.trim())
}

// ─── TOTP Authenticator App protection for Settings ───

import { supabase } from './supabaseClient'
import * as OTPAuth from 'otpauth'

const TOTP_SECRET_KEY_BASE = 'pawnvault_totp_secret'

/** Check if TOTP (authenticator app) has been set up */
export function isTotpSetUp(): boolean {
  return !!localStorage.getItem(scopedKey(TOTP_SECRET_KEY_BASE))
}

/** Generate a new TOTP secret and return the setup data (secret + otpauth URI) */
export function generateTotpSecret(): { secret: string; uri: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'PawnVault',
    label: 'Shop Owner',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 })
  })
  return {
    secret: totp.secret.base32,
    uri: totp.toString()
  }
}

/** Save the TOTP secret — persists to both localStorage and Supabase user metadata */
export async function saveTotpSecret(base32Secret: string): Promise<void> {
  localStorage.setItem(scopedKey(TOTP_SECRET_KEY_BASE), base32Secret)
  try {
    await supabase.auth.updateUser({ data: { totp_secret: base32Secret } })
  } catch { /* localStorage is the local fallback */ }
}

/** Remove the TOTP secret — clears from both localStorage and Supabase */
export async function removeTotpSecret(): Promise<void> {
  localStorage.removeItem(scopedKey(TOTP_SECRET_KEY_BASE))
  try {
    await supabase.auth.updateUser({ data: { totp_secret: null } })
  } catch { /* silent */ }
}

/**
 * Sync TOTP secret from Supabase user metadata to localStorage.
 * Call on Settings mount so any device that shares the same account
 * can skip the QR setup and go straight to code entry.
 */
export async function syncTotpFromSupabase(): Promise<void> {
  if (!_activeUserId) return
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const cloudSecret: string | undefined = user?.user_metadata?.totp_secret
    const localSecret = localStorage.getItem(scopedKey(TOTP_SECRET_KEY_BASE))
    if (cloudSecret && !localSecret) {
      // Pull from cloud → this device
      localStorage.setItem(scopedKey(TOTP_SECRET_KEY_BASE), cloudSecret)
    } else if (localSecret && !cloudSecret) {
      // Push local → cloud (migrates existing users)
      await supabase.auth.updateUser({ data: { totp_secret: localSecret } })
    }
  } catch { /* silent — localStorage remains source of truth */ }
}

/** Verify a 6-digit code from the authenticator app */
export function verifyTotpCode(code: string): boolean {
  const stored = localStorage.getItem(scopedKey(TOTP_SECRET_KEY_BASE))
  if (!stored) return false

  const totp = new OTPAuth.TOTP({
    issuer: 'PawnVault',
    label: 'Shop Owner',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(stored)
  })

  // Allow 1 period drift (±30 seconds) for clock skew
  const delta = totp.validate({ token: code, window: 1 })
  return delta !== null
}
