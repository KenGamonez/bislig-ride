let audioContext: AudioContext | null = null
let chatAudioUnlocked = false

export function unlockNotificationAudio() {
  chatAudioUnlocked = true

  if (!audioContext) {
    return
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }
}

export function playRequestChime() {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) return

    if (!audioContext) {
      audioContext = new AudioContextCtor()
    }

    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }

    const now = audioContext.currentTime
    const notes = [523.25, 659.25, 783.99]

    notes.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator()
      const gain = audioContext!.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      const startAt = now + index * 0.12
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.4)

      oscillator.connect(gain)
      gain.connect(audioContext!.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.45)
    })
  } catch {
    // Audio is not available — the request is still shown in the app.
  }
}

export function playChatNotification() {
  if (!chatAudioUnlocked) {
    return
  }

  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) return

    if (!audioContext) {
      audioContext = new AudioContextCtor()
    }

    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }

    const now = audioContext.currentTime
    const notes = [880, 1174.66]

    notes.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator()
      const gain = audioContext!.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      const startAt = now + index * 0.1
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.1, startAt + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32)

      oscillator.connect(gain)
      gain.connect(audioContext!.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.36)
    })
  } catch {
    // Audio is not available — the chat notice still appears in the app.
  }
}

export function notificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false

  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function getVapidPublicKey(): string {
  try {
    return import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''
  } catch {
    return ''
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const raw = window.atob(normalized + padding)
  const output = new Uint8Array(new ArrayBuffer(raw.length))

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''

  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index])
  }

  return window.btoa(binary)
}

export type DriverPushStatus =
  | { status: 'subscribed' }
  | { status: 'unsupported' }
  | { status: 'no-key' }
  | { status: 'denied' }
  | { status: 'error'; message: string }

export async function ensureDriverPushSubscription(): Promise<DriverPushStatus> {
  if (!isPushSupported()) {
    return { status: 'unsupported' }
  }

  const vapidKey = getVapidPublicKey()

  if (!vapidKey) {
    return { status: 'no-key' }
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js')

    const existing = await registration.pushManager.getSubscription()

    if (existing) {
      return { status: 'subscribed' }
    }

    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })

    return { status: 'subscribed' }
  } catch (error) {
    if (Notification.permission === 'denied') {
      return { status: 'denied' }
    }

    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unable to enable push notifications.',
    }
  }
}

export async function saveDriverPushSubscription(driverId: string): Promise<void> {
  const { supabase } = await import('./supabase')

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    throw new Error('No push subscription is available.')
  }

  const rawKey = subscription.getKey('p256dh')
  const rawAuth = subscription.getKey('auth')

  const p256dh = arrayBufferToBase64(rawKey)
  const auth = arrayBufferToBase64(rawAuth)

  if (!p256dh || !auth) {
    throw new Error('Push subscription keys are unavailable.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      driver_id: driverId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    throw error
  }
}

export function showBrowserNotification(title: string, body: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  try {
    const notification = new Notification(title, {
      body,
      tag: 'bislig-ride-request',
      dir: 'auto',
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  } catch {
    // Notifications unavailable — the request is still shown in the app.
  }
}