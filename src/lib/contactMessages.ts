import { supabase } from './supabase'
import type { ContactMessage, ContactMessageInsert, ContactMessageStatus } from '../types/contactMessage'

type DatabaseContactMessage = ContactMessage

function mapContactMessage(row: DatabaseContactMessage): ContactMessage {
  return row
}

export async function createContactMessage(payload: ContactMessageInsert) {
  const { error } = await supabase.from('contact_messages').insert(payload)

  if (error) throw error
}

export async function getContactMessages() {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => mapContactMessage(row as DatabaseContactMessage))
}

export async function updateContactMessageStatus(id: string, status: ContactMessageStatus) {
  const { data, error } = await supabase
    .from('contact_messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error

  return mapContactMessage(data as DatabaseContactMessage)
}