import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { listPakyawanMessages, sendPakyawanMessage } from '../lib/scheduledBookings'
import type { PakyawanChatRole } from '../types/scheduledBooking'

export type ChatMessageItem = {
  id: string
  sender_role: string
  message: string
  created_at: string
}

export type ChatTransport = {
  list: (bookingId: string, accessToken?: string | null) => Promise<ChatMessageItem[]>
  send: (
    bookingId: string,
    accessToken: string | null | undefined,
    senderRole: string,
    message: string,
  ) => Promise<ChatMessageItem>
  realtimeTable?: string
  realtimeColumn?: string
  channelPrefix?: string
}

const defaultTransport: ChatTransport = {
  list: (bookingId, accessToken) => listPakyawanMessages(bookingId, accessToken),
  send: (bookingId, accessToken, senderRole, message) =>
    sendPakyawanMessage({
      bookingId,
      accessToken: accessToken ?? null,
      senderRole: senderRole as PakyawanChatRole,
      message,
    }),
  realtimeTable: 'pakyawan_messages',
  realtimeColumn: 'booking_id',
  channelPrefix: 'pakyawan-chat',
}

type PakyawanChatProps = {
  bookingId: string
  senderRole: PakyawanChatRole
  accessToken?: string | null
  otherPartyName: string
  enableRealtime?: boolean
  pollIntervalMs?: number
  onClose: () => void
  transport?: ChatTransport
}

type PakyawanChatPanelProps = PakyawanChatProps & {
  bare?: boolean
}

export function PakyawanChatPanel({
  bookingId,
  senderRole,
  accessToken = null,
  otherPartyName,
  enableRealtime = false,
  pollIntervalMs = 10000,
  onClose,
  transport = defaultTransport,
  bare = false,
}: PakyawanChatPanelProps) {
  const { t } = useLanguage()
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true

    const loadMessages = async (showLoading: boolean) => {
      if (showLoading && mounted) {
        setLoading(true)
      }

      try {
        const items = await transport.list(bookingId, accessToken)

        if (mounted) {
          // Keep the previous array reference when nothing changed so the
          // 10-second poll does not rerender or smooth-scroll the chat.
          setMessages((current) => {
            if (
              current.length === items.length &&
              current.every((item, index) => item.id === items[index].id)
            ) {
              return current
            }

            return items
          })
        }
      } catch (error) {
        console.error('Unable to load pakyawan chat:', error)
      }

      if (showLoading && mounted) {
        setLoading(false)
      }
    }

    void loadMessages(true)

    const timer = window.setInterval(() => {
      void loadMessages(false)
    }, pollIntervalMs)

    const channel = enableRealtime
      ? supabase
          .channel(`${transport.channelPrefix ?? 'pakyawan-chat'}-${bookingId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: transport.realtimeTable ?? 'pakyawan_messages',
              filter: `${transport.realtimeColumn ?? 'booking_id'}=eq.${bookingId}`,
            },
            (payload) => {
              const incoming = payload.new as ChatMessageItem

              setMessages((current) => {
                if (current.some((item) => item.id === incoming.id)) {
                  return current
                }

                return [...current, incoming]
              })
            },
          )
          .subscribe()
      : null

    return () => {
      mounted = false
      window.clearInterval(timer)

      if (channel) {
        void supabase.removeChannel(channel)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  const lastScrolledIdRef = useRef<string | null>(null)

  useEffect(() => {
    const last = messages[messages.length - 1] ?? null
    const prevId = lastScrolledIdRef.current
    lastScrolledIdRef.current = last?.id ?? null

    // Scroll only when a genuinely new message arrives — never on initial
    // load or on background polls that change nothing.
    if (!last || prevId === null || prevId === last.id) {
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const trimmedMessage = message.trim()

    if (!trimmedMessage || sending) {
      return
    }

    setSendError('')
    setSending(true)

    try {
      const sent = await transport.send(bookingId, accessToken, senderRole, trimmedMessage)

      setMessages((current) => {
        if (current.some((item) => item.id === sent.id)) {
          return current
        }

        return [...current, sent]
      })

      setMessage('')
    } catch (error) {
      console.error('Unable to send pakyawan chat message:', error)
      setSendError(error instanceof Error && error.message ? error.message : t('chat.sendFailed'))
    }

    setSending(false)
  }

  const panel = (
      <div className="ride-chat-panel">
        <div className="ride-chat-header">
          <div>
            <strong>{t('chat.titleWith', { name: otherPartyName })}</strong>
            <span>Bislig Ride</span>
          </div>

          <button type="button" className="ride-chat-close" onClick={onClose} aria-label={t('chat.closeAria')}>
            X
          </button>
        </div>

        <div className="ride-chat-messages">
          {loading ? (
            <p className="ride-chat-empty">{t('chat.loading')}</p>
          ) : messages.length === 0 ? (
            <p className="ride-chat-empty">
              {t('chat.empty', { role: senderRole === 'passenger' ? t('chat.roleDriver') : t('chat.rolePassenger') })}
            </p>
          ) : (
            messages.map((item) => {
              const isMine = item.sender_role === senderRole

              return (
                <div key={item.id} className={`ride-chat-message ${isMine ? 'mine' : 'theirs'}`}>
                  <div className="ride-chat-bubble">
                    <p>{item.message}</p>
                    <small>
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </small>
                  </div>
                </div>
              )
            })
          )}

          <div ref={messagesEndRef} />
        </div>

        {sendError && (
          <div className="ride-chat-error" role="alert">{sendError}</div>
        )}

        <form className="ride-chat-input-row" onSubmit={handleSubmit}>
          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t('chat.placeholder')}
            maxLength={1000}
            disabled={sending}
            aria-label={t('chat.aria')}
          />

          <button type="submit" disabled={sending}>
            {sending ? '...' : t('chat.send')}
          </button>
        </form>
      </div>
  )

  if (bare) {
    return panel
  }

  return (
    <div className="ride-chat-inline" role="region" aria-label={t('chat.titleWith', { name: otherPartyName })}>
      {panel}
    </div>
  )
}

export function PakyawanChat(props: PakyawanChatProps) {
  const { t } = useLanguage()

  return (
    <div className="ride-chat-overlay" role="dialog" aria-modal="true" aria-label={t('chat.titleWith', { name: props.otherPartyName })}>
      <PakyawanChatPanel {...props} bare />
    </div>
  )
}

type PakyawanChatAlertPopupProps = {
  eyebrow: string
  title: string
  subtitle: string
  preview: string
  openLabel: string
  closeLabel: string
  onOpen: () => void
  onClose: () => void
}

export function PakyawanChatAlertPopup({
  eyebrow,
  title,
  subtitle,
  preview,
  openLabel,
  closeLabel,
  onOpen,
  onClose,
}: PakyawanChatAlertPopupProps) {
  return (
    <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ride-request-sheet">
        <section className="driver-card pakyawan-card">
          <div className="state-heading">
            <div>
              <p className="section-label">{eyebrow}</p>
              <h3>{title}</h3>
              <p>{subtitle}</p>
            </div>
          </div>
          <p className="pak-chat-preview">{preview}</p>
          <div className="pak-req-actions">
            <button type="button" className="primary-action" onClick={onOpen}>
              {openLabel}
            </button>
            <button type="button" className="secondary-action" onClick={onClose}>
              {closeLabel}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
