const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

export function isCloudinaryConfigured(): boolean {
  return !!cloudName && !!uploadPreset
}

export async function uploadImageToCloudinary(file: Blob, fileName?: string): Promise<string> {
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET')
  }

  const uploadFile = file instanceof File
    ? file
    : new File([file], fileName || 'image.jpg', { type: file.type || 'image/jpeg' })

  const formData = new FormData()
  formData.append('file', uploadFile)
  formData.append('upload_preset', uploadPreset)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Cloudinary upload failed')
  }

  const data = await response.json()
  const url = data.secure_url || data.url
  if (!url) throw new Error('Cloudinary upload failed')
  return url
}
