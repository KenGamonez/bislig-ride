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