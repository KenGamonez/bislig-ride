import { supabase } from './supabase'

export const driverPhotoBucket = 'driver-photos'

const MAX_PHOTO_SIZE = 5 * 1024 * 1024
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export type DriverPhotoValidation = {
  valid: boolean
  message?: string
}

export function validateDriverPhoto(file: File | null): DriverPhotoValidation {
  if (!file) {
    return { valid: false, message: 'Choose a photo for the driver.' }
  }
  if (!file.type.startsWith('image/')) {
    return { valid: false, message: 'Please choose an image file.' }
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return { valid: false, message: 'Unsupported image format. Use JPEG, PNG, WebP, or GIF.' }
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return { valid: false, message: 'Photo must be 5 MB or smaller.' }
  }
  return { valid: true }
}

function extensionFromFile(file: File): string {
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  return byMime[file.type] ?? 'img'
}

export function buildDriverPhotoPath(file: File): string {
  return `admin/${crypto.randomUUID()}/profile-photo.${extensionFromFile(file)}`
}

export async function uploadDriverPhoto(file: File): Promise<{ path: string; publicUrl: string }> {
  const path = buildDriverPhotoPath(file)

  const { error } = await supabase.storage
    .from(driverPhotoBucket)
    .upload(path, file, { upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(driverPhotoBucket).getPublicUrl(path)

  return { path, publicUrl: data.publicUrl }
}

export async function removeUploadedDriverPhoto(path: string): Promise<void> {
  if (!path) return
  const { error } = await supabase.storage.from(driverPhotoBucket).remove([path])
  if (error) {
    console.error('Unable to clean up driver photo:', error)
  }
}