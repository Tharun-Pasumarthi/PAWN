import { useEffect, useState } from 'react'
import { isLocalImageRef, resolveLocalImageUrl } from '../services/localImageStore'

export function useResolvedImage(src: string | null) {
  const [resolved, setResolved] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    if (!src) {
      setResolved(null)
      return () => { active = false }
    }

    if (!isLocalImageRef(src)) {
      setResolved(src)
      return () => { active = false }
    }

    resolveLocalImageUrl(src).then(url => {
      if (active) setResolved(url)
    })

    return () => { active = false }
  }, [src])

  return resolved
}
