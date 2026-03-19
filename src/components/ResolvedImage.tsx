import type { ImgHTMLAttributes, ReactNode } from 'react'
import { useResolvedImage } from '../hooks/useResolvedImage'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string | null
  fallback?: ReactNode
}

export default function ResolvedImage({ src, fallback = null, ...imgProps }: Props) {
  const resolved = useResolvedImage(src)

  if (!resolved) return <>{fallback}</>

  return <img src={resolved} {...imgProps} />
}
