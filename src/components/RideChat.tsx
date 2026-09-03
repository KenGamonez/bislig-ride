import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getCustomerAuthId, supabase } from '../lib/supabase'

type ChatMessage = {
  id: string
  ride_id: string
  sender_id: string
  sender_role: 'customer' | 'driver'
  message: string
  created_at: string
}

type RideChatProps = {
  rideId: string
  otherPartyName: string
  currentRole: 'customer' | 'driver'
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

    if (currentRole === 'customer') {
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
        setSendError(error?.message || 'Unable to send message.')
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
    <div className="ride-chat-overlay" role="dialog" aria-modal="true" aria-label={`Chat with ${otherPartyName}`}>
      <div className="ride-chat-panel">
        <div className="ride-chat-header">
          <div>
            <strong>Chat with {otherPartyName}</strong>
            <span>Bislig Ride</span>
          </div>

          <button type="button" className="ride-chat-close" onClick={onClose} aria-label="Close chat">
            X
          </button>
        </div>

        <div className="ride-chat-messages">
          {loading ? (
            <p className="ride-chat-empty">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="ride-chat-empty">
              No messages yet. Send a message to your {currentRole === 'customer' ? 'driver' : 'passenger'}.
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
            placeholder="Type a message..."
            maxLength={1000}
            disabled={sending}
            aria-label="Chat message"
          />

          <button type="submit" disabled={sending}>
            {sending ? '...' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  )
}










