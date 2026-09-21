import { useCallback, useEffect, useRef, useState } from 'react'
import { PakyawanChat } from './PakyawanChat'
import { listDeliveryMessages, sendDeliveryMessage } from '../lib/deliveries'
import { unlockNotificationAudio } from '../lib/notifications'
import { useLanguage } from '../lib/i18n'
import type { DeliveryChatRole } from '../types/delivery'

type DeliveryChatSectionProps = {
  deliveryId: string
  accessToken?: string | null
  role: DeliveryChatRole
  otherPartyName: string
  toggleLabel: string
  enableRealtime?: boolean
  forceOpen?: boolean
  onOpenChange?: (open: boolean) => void
  onIncomingMessage?: (preview: string) => void
}

const seenKey = (deliveryId: string) => `bislig-ride-padeliver-chatseen-${deliveryId}`

function readSeen(deliveryId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(deliveryId))
  } catch {
    return null
  }
}

function writeSeen(deliveryId: string, messageId: string) {
  try {
    window.localStorage.setItem(seenKey(deliveryId), messageId)
  } catch {
    // Private browsing — unread state stays in memory.
  }
}

export function DeliveryChatSection({
  deliveryId,
  accessToken = null,
  role,
  otherPartyName,
  toggleLabel,
  enableRealtime = false,
  forceOpen,
  onOpenChange,
  onIncomingMessage,
}: DeliveryChatSectionProps) {
  const { t } = useLanguage()
  const [internalOpen, setInternalOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const alertedIdRef = useRef<string | null>(null)

  const onIncomingMessageRef = useRef(onIncomingMessage)

  useEffect(() => {
    onIncomingMessageRef.current = onIncomingMessage
  })

  const open = forceOpen ?? internalOpen

  const setOpen = (next: boolean) => {
    onOpenChange?.(next)

    if (forceOpen === undefined) {
      setInternalOpen(next)
    }
  }

  const markSeen = useCallback(async () => {
    try {
      const items = await listDeliveryMessages(deliveryId, accessToken)
      const newest = items[items.length - 1]

      if (newest) {
        writeSeen(deliveryId, newest.id)
      }
    } catch {
      // Keep the previous seen state.
    }

    alertedIdRef.current = null
    setHasUnread(false)
  }, [deliveryId, accessToken])

  const prevOpenRef = useRef(open)

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      void markSeen()
    }

    prevOpenRef.current = open
  }, [open, markSeen])

  useEffect(() => {
    if (open) {
      return
    }

    let cancelled = false

    const check = async () => {
      if (cancelled) {
        return
      }

      try {
        const items = await listDeliveryMessages(deliveryId, accessToken)

        if (cancelled) {
          return
        }

        const newest = items[items.length - 1]

        if (!newest || newest.sender_role === role) {
          return
        }

        const seen = readSeen(deliveryId)

        if (seen === null) {
          writeSeen(deliveryId, newest.id)
          return
        }

        if (newest.id !== seen && alertedIdRef.current !== newest.id) {
          alertedIdRef.current = newest.id
          setHasUnread(true)
          onIncomingMessageRef.current?.(newest.message)
        }
      } catch {
        // Polling must never break the page.
      }
    }

    void check()
    const timer = window.setInterval(check, 10000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [deliveryId, accessToken, role, open])

  const toggle = () => {
    unlockNotificationAudio()

    if (!open) {
      void markSeen()
    }

    setOpen(!open)
  }

  return (
    <>
      <div className="pakyawan-actions">
        <button type="button" className="secondary-action compact-button" onClick={toggle}>
          {open ? t('chat.closeAria') : toggleLabel}
          {hasUnread && !open ? <span className="mini-nav-badge" aria-hidden="true">1</span> : null}
        </button>
      </div>
      {open ? (
        <PakyawanChat
          bookingId={deliveryId}
          senderRole={role === 'driver' ? 'driver' : 'passenger'}
          accessToken={accessToken}
          otherPartyName={otherPartyName}
          enableRealtime={enableRealtime}
          onClose={() => setOpen(false)}
          transport={{
            list: (id, token) => listDeliveryMessages(id, token),
            send: (id, token, senderRole, message) =>
              sendDeliveryMessage({
                deliveryId: id,
                accessToken: token ?? null,
                senderRole: senderRole as DeliveryChatRole,
                message,
              }),
            realtimeTable: 'delivery_messages',
            realtimeColumn: 'delivery_id',
            channelPrefix: role === 'driver' ? 'driver-delivery-chat' : 'delivery-chat',
          }}
        />
      ) : null}
    </>
  )
}
