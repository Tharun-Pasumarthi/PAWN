import { useState, useCallback } from 'react'
import TotpVerifyModal from '../components/TotpVerifyModal'

declare const NativeBiometric: {
  isAvailable(): Promise<{ isAvailable: boolean }>
  verifyIdentity(opts: { title: string; subtitle: string; negativeButtonText: string; maxAttempts: number }): Promise<void>
} | undefined

async function tryNativeBiometric(reason: string): Promise<'success' | 'failed' | 'unavailable'> {
  try {
    // Dynamically import to avoid crashing on web where the plugin doesn't exist
    const { NativeBiometric: NB } = await import('capacitor-native-biometric')
    const { isAvailable } = await NB.isAvailable()
    if (!isAvailable) return 'unavailable'
    await NB.verifyIdentity({
      title: 'Authentication Required',
      subtitle: reason,
      negativeButtonText: 'Cancel',
      maxAttempts: 3
    })
    return 'success'
  } catch (err: any) {
    // Plugin not installed / not on native → fall through to TOTP
    if (
      err?.message?.includes('not implemented') ||
      err?.message?.includes('not available') ||
      err?.code === 'UNIMPLEMENTED'
    ) {
      return 'unavailable'
    }
    // User cancelled or biometric failed
    return 'failed'
  }
}

/**
 * Hook that returns:
 * - `verify(reason)` — tries native biometric first; if hardware unavailable shows TOTP modal
 * - `modal` — JSX to render inside the page (null when not visible)
 */
export function useVerifyAuth() {
  const [pending, setPending] = useState<{ reason: string; resolve: (v: boolean) => void } | null>(null)

  const verify = useCallback(async (reason: string): Promise<boolean> => {
    const result = await tryNativeBiometric(reason)
    if (result === 'success') return true
    if (result === 'failed') return false

    // Hardware unavailable — show TOTP modal
    return new Promise<boolean>(resolve => {
      setPending({ reason, resolve })
    })
  }, [])

  const modal = pending ? (
    <TotpVerifyModal
      reason={pending.reason}
      onSuccess={() => { pending.resolve(true); setPending(null) }}
      onCancel={() => { pending.resolve(false); setPending(null) }}
    />
  ) : null

  return { verify, modal }
}
