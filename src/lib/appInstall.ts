import { useCallback, useEffect, useState } from 'react'
import { isIOSDevice } from './notifications'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false

  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean
  }

  return navigatorWithStandalone.standalone === true
}

export type InstallPromptResult = 'accepted' | 'dismissed' | 'unavailable'

export function useAppInstall() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(() => isStandaloneDisplay())
  const isIOS = isIOSDevice()

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallPromptResult> => {
    if (!deferredPrompt) {
      return 'unavailable'
    }

    deferredPrompt.prompt()

    try {
      const choice = await deferredPrompt.userChoice
      return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed'
    } catch {
      return 'dismissed'
    }
  }, [deferredPrompt])

  return {
    canInstall: deferredPrompt !== null,
    isInstalled: installed,
    isIOS,
    promptInstall,
  }
}
