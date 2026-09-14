import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getCustomerAuthId, supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'

type ChatMessage = {
  id: string
  ride_id: string
  sender_id: string
  sender_role: 'Rider' | 'driver'
  message: string
  created_at: string
}

type RideChatProps = {
  rideId: string
  otherPartyName: string
  currentRole: 'Rider' | 'driver'
  currentDriverId?: string | null
  driverAuthId?: string | null
  onClose: () => void
}

export function RideChat({
  rideId,
  otherPartyName,
  currentRole,
  currentDriverId,
  driverAuthId,
  onClose,
}: RideChatProps) {
  const { t } = useLanguage()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true

    const loadMessages = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('ride_messages')
        .select('*')
        .eq('ride_id', rideId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Unable to load ride chat:', error)
      } else if (mounted) {
        setMessages((data ?? []) as ChatMessage[])
      }

      if (mounted) {
        setLoading(false)
      }
    }

    void loadMessages()

    const channel = supabase
      .channel(`ride-chat-${rideId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage

          setMessages((current) => {
            if (current.some((item) => item.id === incoming.id)) {
              return current
            }

            return [...current, incoming]
          })
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [rideId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    const trimmedMessage = message.trim()

    if (!trimmedMessage || sending) {
      return
    }

    let senderId = currentRole === 'driver' ? (driverAuthId ?? '') : (currentDriverId ?? '')

    if (currentRole === 'Rider') {
      senderId = await getCustomerAuthId()
    }

    if (!senderId) {
      console.error('Unable to determine chat sender.')
      return
    }

    setSendError("")
      setSending(true)

    const { data, error } = await supabase
      .from('ride_messages')
      .insert({
        ride_id: rideId,
        sender_id: senderId,
        sender_role: currentRole,
        message: trimmedMessage,
      })
      .select()
      .single()

    if (error) {
      console.error('Unable to send ride chat message:', error)
        setSendError(error?.message || t('chat.sendFailed'))
    } else {
      const sent = data as ChatMessage

      setMessages((current) => {
        if (current.some((item) => item.id === sent.id)) {
          return current
        }

        return [...current, sent]
      })

      setMessage('')
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
              {t('chat.empty', { role: currentRole === 'Rider' ? t('chat.roleDriver') : t('chat.rolePassenger') })}
            </p>
          ) : (
            messages.map((item) => {
              const isMine = item.sender_role === currentRole

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










