/**
 * Biometric authentication with per-user registration.
 * Uses Web Authentication API for fingerprint / Face ID / PIN.
 *
 * Flow:
 * 1. Register a user — stores credential ID in localStorage
 * 2. Authenticate — verifies using stored credential
 */

const STORAGE_KEY = 'pawnvault_bio_users'

export interface BioUser {
  name: string
  credentialId: string        // base64-encoded credential raw ID
  registeredAt: string        // ISO date
}

// ─── Helpers ───

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromBase64(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function getUsers(): BioUser[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

function saveUsers(users: BioUser[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
}

// ─── Public API ───

/** Check if the device supports biometric / platform authentication */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
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
 * Register a new user with biometric credential (fingerprint / Face ID).
 * The device will prompt the user to scan fingerprint or face.
 */
export async function registerUser(name: string): Promise<{ success: boolean; error?: string }> {
  const available = await isBiometricAvailable()
  if (!available) return { success: false, error: 'Biometric authentication not available on this device' }

  const trimmed = name.trim()
  if (!trimmed) return { success: false, error: 'Name is required' }

  // Check duplicate name
  const existing = getUsers()
  if (existing.some(u => u.name.toLowerCase() === trimmed.toLowerCase())) {
    return { success: false, error: 'A user with this name is already registered' }
  }

  try {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    // Generate a unique user ID from the name
    const userId = new TextEncoder().encode(trimmed.slice(0, 64))

    // Get existing credential IDs to exclude (prevent re-registration of same authenticator)
    const excludeCredentials: PublicKeyCredentialDescriptor[] = existing.map(u => ({
      id: fromBase64(u.credentialId).buffer as ArrayBuffer,
      type: 'public-key' as const
    }))

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'PawnVault', id: window.location.hostname },
        user: {
          id: userId,
          name: trimmed,
          displayName: trimmed
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },
          { alg: -257, type: 'public-key' }
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        excludeCredentials,
        timeout: 60000
      }
    }) as PublicKeyCredential | null

    if (!credential) return { success: false, error: 'Registration cancelled' }

    const newUser: BioUser = {
      name: trimmed,
      credentialId: toBase64(credential.rawId),
      registeredAt: new Date().toISOString()
    }

    saveUsers([...existing, newUser])
    return { success: true }
  } catch (err: any) {
    if (err.name === 'NotAllowedError') return { success: false, error: 'Registration cancelled by user' }
    if (err.name === 'InvalidStateError') return { success: false, error: 'This biometric is already registered to another user' }
    return { success: false, error: err.message || 'Registration failed' }
  }
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
 * Authenticate using a registered biometric credential.
 * Prompts fingerprint / Face ID and verifies against registered users.
 * Returns the authenticated user's name, or null if failed.
 */
export async function authenticateUser(): Promise<string | null> {
  const users = getUsers()

  if (users.length === 0) {
    // No users registered — strictly block
    return null
  }

  const available = await isBiometricAvailable()
  if (!available) {
    // Device doesn't support biometric — strictly block
    return null
  }

  try {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    const allowCredentials: PublicKeyCredentialDescriptor[] = users.map(u => ({
      id: fromBase64(u.credentialId).buffer as ArrayBuffer,
      type: 'public-key' as const
    }))

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
        allowCredentials
      }
    }) as PublicKeyCredential | null

    if (!assertion) return null

    // Match the returned credential ID to a registered user
    const returnedId = toBase64(assertion.rawId)
    const matched = users.find(u => u.credentialId === returnedId)
    return matched ? matched.name : null
  } catch {
    return null
  }
}

/**
 * Convenience wrapper: prompt biometric and return success boolean.
 * Used by edit/delete/release actions.
 * STRICTLY BLOCKS if no users registered or biometric unavailable.
 */
export async function requestBiometricAuth(_reason: string = 'Verify your identity'): Promise<boolean> {
  const users = getUsers()

  if (users.length === 0) {
    // No registered users — block action entirely
    return false
  }

  const result = await authenticateUser()
  return result !== null
}

// ─── TOTP Authenticator App protection for Settings ───

import * as OTPAuth from 'otpauth'

const TOTP_SECRET_KEY = 'pawnvault_totp_secret'

/** Check if TOTP (authenticator app) has been set up */
export function isTotpSetUp(): boolean {
  return !!localStorage.getItem(TOTP_SECRET_KEY)
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

/** Save the TOTP secret after successful verification */
export function saveTotpSecret(base32Secret: string): void {
  localStorage.setItem(TOTP_SECRET_KEY, base32Secret)
}

/** Verify a 6-digit code from the authenticator app */
export function verifyTotpCode(code: string): boolean {
  const stored = localStorage.getItem(TOTP_SECRET_KEY)
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
