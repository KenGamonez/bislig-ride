import { useCallback, useEffect, useRef, useState } from 'react'
import { listPakyawanMessages } from './scheduledBookings'
import { playChatNotification, showBrowserNotification } from './notifications'

export type PakyawanMessageAlert = {
  bookingId: string
  messageId: string
  preview: string
}

const POLL_INTERVAL_MS = 10000

const seenKey = (bookingId: string) => `bislig-ride-pakyawan-chatseen-${bookingId}`

function readSeen(bookingId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(bookingId))
  } catch {
    return null
  }
}

function writeSeen(bookingId: string, messageId: string) {
  try {
    window.localStorage.setItem(seenKey(bookingId), messageId)
  } catch {
    // Private browsing or disabled storage — unread state stays in memory.
  }
}

/** Record the newest message as seen (used when a chat panel is opened). */
export async function markPakyawanChatSeen(bookingId: string, accessToken: string | null) {
  try {
    const items = await listPakyawanMessages(bookingId, accessToken)
    const newest = items[items.length - 1]

    if (newest) {
      writeSeen(bookingId, newest.id)
    }
  } catch {
    // Keep the previous seen state — polling must never break the page.
  }
}

/**
 * Polling-based new-message detector for anonymous passengers (who cannot
 * use authenticated Realtime). Watches one booking's messages and raises a
 * single alert per unseen driver message. Never throws into the page.
 */
export function usePakyawanMessageAlert(args: {
  bookingId: string | null
  accessToken: string | null
  chatOpen: boolean
  enabled: boolean
  notificationTitle: string
}) {
  const { bookingId, accessToken, chatOpen, enabled, notificationTitle } = args
  const [alert, setAlert] = useState<PakyawanMessageAlert | null>(null)
  const alertedIdRef = useRef<string | null>(null)

  const markChatSeen = useCallback(async () => {
    if (!bookingId) {
      return
    }

    await markPakyawanChatSeen(bookingId, accessToken)

    alertedIdRef.current = null
    setAlert(null)
  }, [bookingId, accessToken])

  const dismissAlert = useCallback(() => {
    setAlert(null)
  }, [])

  useEffect(() => {
    if (!enabled || !bookingId || chatOpen) {
      return
    }

    let cancelled = false

    const check = async () => {
      if (cancelled) {
        return
      }

      try {
        const items = await listPakyawanMessages(bookingId, accessToken)

        if (cancelled) {
          return
        }

        const newest = items[items.length - 1]

        if (!newest || newest.sender_role !== 'driver') {
          return
        }

        const seen = readSeen(bookingId)

        if (seen === null) {
          // First observation establishes the baseline silently.
          writeSeen(bookingId, newest.id)
          return
        }

        if (newest.id !== seen && alertedIdRef.current !== newest.id) {
          alertedIdRef.current = newest.id
          setAlert({ bookingId, messageId: newest.id, preview: newest.message })
          playChatNotification()
          showBrowserNotification(notificationTitle, newest.message.slice(0, 120))
        }
      } catch {
        // Polling must never break the page.
      }
    }

    const timer = window.setInterval(check, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, bookingId, accessToken, chatOpen, notificationTitle])

  // A stale alert never renders for a different booking.
  const visibleAlert = alert && alert.bookingId === bookingId ? alert : null

  return { alert: visibleAlert, markChatSeen, dismissAlert }
}
