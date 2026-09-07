import { supabase } from './supabase'

export const driverApplicationBucket = 'driver-applications'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']

export type ApplicationFileValidation = {
  valid: boolean
  message?: string
}

export function validateApplicationImage(file: File): ApplicationFileValidation {
  if (!file) {
    return { valid: false, message: 'This file is required.' }
  }
  if (!file.type.startsWith('image/')) {
    return { valid: false, message: 'Please upload an image file.' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, message: 'Unsupported image format.' }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, message: 'Image must be 5 MB or smaller.' }
  }
  return { valid: true }
}

function extensionFromFile(file: File): string {
  const name = file.name.toLowerCase()
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex !== -1 && dotIndex < name.length - 1) {
    const ext = name.slice(dotIndex + 1)
    if (/^[a-z0-9]{1,8}$/.test(ext)) return ext
  }
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }
  return byMime[file.type] ?? 'img'
}

export function buildApplicationFilePaths(applicationId: string, photo: File, license: File) {
  return {
    photoPath: `${applicationId}/driver-photo.${extensionFromFile(photo)}`,
    licensePath: `${applicationId}/drivers-license.${extensionFromFile(license)}`,
  }
}

export async function uploadApplicationFile(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(driverApplicationBucket)
    .upload(path, file, { upsert: false })

  if (error) throw error
}

export async function removeApplicationFile(path: string): Promise<void> {
  if (!path) return
  const { error } = await supabase.storage.from(driverApplicationBucket).remove([path])
  if (error) {
    console.error('Unable to clean up application file:', error)
  }
}

export async function createSignedApplicationFileUrl(path: string): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(driverApplicationBucket)
    .createSignedUrl(path, 3600)

  if (error) {
    console.error('Unable to create signed URL for application file:', error)
    return null
  }

  return data.signedUrl
}
