import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import { listPakyawanMessages, sendPakyawanMessage } from '../lib/scheduledBookings'
import type { PakyawanChatRole, PakyawanMessage } from '../types/scheduledBooking'

type PakyawanChatProps = {
  bookingId: string
  senderRole: PakyawanChatRole
  accessToken?: string | null
  otherPartyName: string
  enableRealtime?: boolean
  pollIntervalMs?: number
  onClose: () => void
}

export function PakyawanChat({
  bookingId,
  senderRole,
  accessToken = null,
  otherPartyName,
  enableRealtime = false,
  pollIntervalMs = 10000,
  onClose,
}: PakyawanChatProps) {
  const { t } = useLanguage()
  const [messages, setMessages] = useState<PakyawanMessage[]>([])
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
        const items = await listPakyawanMessages(bookingId, accessToken)

        if (mounted) {
          setMessages(items)
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
          .channel(`pakyawan-chat-${bookingId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'pakyawan_messages',
              filter: `booking_id=eq.${bookingId}`,
            },
            (payload) => {
              const incoming = payload.new as PakyawanMessage

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

  useEffect(() => {
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
      const sent = await sendPakyawanMessage({
        bookingId,
        accessToken,
        senderRole,
        message: trimmedMessage,
      })

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

  return (
    <div className="ride-chat-overlay" role="dialog" aria-modal="true" aria-label={t('chat.titleWith', { name: otherPartyName })}>
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
