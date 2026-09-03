export const driverApplicationStatuses = ['pending', 'contacted', 'approved', 'rejected'] as const
export type DriverApplicationStatus = (typeof driverApplicationStatuses)[number]

export type DriverApplication = {
  id: string
  full_name: string
  mobile_number: string
  barangay: string
  email: string | null
  vehicle_number: string
  plate_number: string | null
  driving_experience: number
  operating_area: string
  preferred_schedule: string
  reason: string | null
  contact_preference: string
  status: DriverApplicationStatus
  created_at: string
}

export type DriverApplicationInsert = Omit<DriverApplication, 'id' | 'status' | 'created_at'>