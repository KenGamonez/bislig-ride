export const driverApplicationStatuses = ['pending', 'approved', 'rejected'] as const
export type DriverApplicationStatus = (typeof driverApplicationStatuses)[number]

export const driverApplicationStatusLabels: Record<DriverApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export type DriverApplication = {
  id: string
  full_name: string
  mobile_number: string
  barangay: string
  email: string
  facebook_profile: string
  vehicle_number: string
  plate_number: string | null
  driving_experience: number
  operating_area: string
  preferred_schedule: string
  reason: string | null
  driver_photo_path: string
  drivers_license_path: string
  status: DriverApplicationStatus
  created_at: string
}

export type DriverApplicationInsert = Omit<DriverApplication, 'id' | 'status' | 'created_at'>