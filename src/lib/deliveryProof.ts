import { supabase } from './supabase'

export const deliveryProofBucket = 'delivery-proofs'

const MAX_PROOF_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export type ProofFileValidation = {
  valid: boolean
  message?: string
}

export function validateDeliveryProofImage(file: File): ProofFileValidation {
  if (!file) {
    return { valid: false, message: 'A photo is required to complete the delivery.' }
  }
  if (!ALLOWED_PROOF_TYPES.includes(file.type)) {
    return { valid: false, message: 'Please take or choose a JPEG, PNG, or WebP photo.' }
  }
  if (file.size > MAX_PROOF_FILE_SIZE) {
    return { valid: false, message: 'Photo must be 5 MB or smaller.' }
  }
  return { valid: true }
}

function extensionFromMimeType(mimeType: string): string {
  const byMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  }
  return byMime[mimeType] ?? 'jpg'
}

export function buildDeliveryProofPath(deliveryId: string, file: File): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  return `${deliveryId}/${uuid}.${extensionFromMimeType(file.type)}`
}

export async function uploadDeliveryProof(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage
    .from(deliveryProofBucket)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) throw error
}

export async function removeDeliveryProof(path: string): Promise<void> {
  if (!path) return
  const { error } = await supabase.storage.from(deliveryProofBucket).remove([path])
  if (error) {
    console.error('Unable to clean up delivery proof upload:', error)
  }
}

export async function getDeliveryProofSignedUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(deliveryProofBucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data?.signedUrl) throw error ?? new Error('Unable to load the proof photo.')

  return data.signedUrl
}
