export const contactMessageStatuses = ['new', 'read', 'replied', 'archived'] as const
export type ContactMessageStatus = (typeof contactMessageStatuses)[number]

export const contactMessageStatusLabels: Record<ContactMessageStatus, string> = {
  new: 'New',
  read: 'Read',
  replied: 'Replied',
  archived: 'Archived',
}

export interface ContactMessage {
  id: string
  inquiry_type: string
  full_name: string
  phone: string
  email: string | null
  organization: string | null
  message: string
  status: ContactMessageStatus
  created_at: string
  updated_at: string
}

export interface ContactMessageInsert {
  inquiry_type: string
  full_name: string
  phone: string
  email?: string | null
  organization?: string | null
  message: string
}