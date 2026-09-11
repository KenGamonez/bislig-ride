import { AppHeader, type AppViewMode } from '../components/AppHeader'
import {
  ServiceInquiryForm,
  type ServiceInquirySection,
} from '../components/ServiceInquiryForm'

const routeToView = (nextView: AppViewMode) => {
  try {
    window.sessionStorage.setItem('bislig-ride-requested-view', nextView)
  } catch {
    // sessionStorage unavailable — the default view will be shown
  }
  window.history.pushState({}, '', '/')
  window.location.reload()
}

const sections: ServiceInquirySection[] = [
  {
    number: '01',
    title: 'The vehicle',
    hint: 'What would you like to rent?',
    fields: [
      {
        name: 'vehicle_type',
        label: 'Vehicle Type',
        type: 'select',
        options: ['Sedan', 'SUV', 'Van', 'Motorcycle', 'Other'],
      },
      {
        name: 'transmission',
        label: 'Transmission',
        type: 'select',
        options: ['Automatic', 'Manual'],
      },
    ],
  },
  {
    number: '02',
    title: 'Schedule',
    hint: 'When do you need the vehicle?',
    fields: [
      { name: 'pickup_date', label: 'Pickup Date', type: 'date' },
      { name: 'pickup_time', label: 'Pickup Time', type: 'time' },
      { name: 'return_date', label: 'Return Date', type: 'date' },
      {
        name: 'with_driver',
        label: 'Driver Option',
        type: 'select',
        options: ['Self-drive', 'With driver'],
      },
    ],
  },
  {
    number: '03',
    title: 'Your contact information',
    hint: 'So we can confirm availability with you',
    fields: [
      { name: 'customer_name', label: 'Full Name' },
      { name: 'customer_phone', label: 'Phone Number', type: 'tel' },
    ],
  },
]

export function CarRentalsExperience({ onBack }: { onBack: () => void }) {
  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
      <ServiceInquiryForm
        idPrefix="car-rentals"
        eyebrow="Self-drive and chauffeur rentals"
        title="Car Rentals"
        titleAccent="/ Pa-arkila"
        subtitle="Rent a sedan, SUV, van, or motorcycle for your plans."
        intro="Car Rentals lets you inquire about renting a vehicle for errands, trips, and events — with or without a driver. A representative will confirm vehicle availability and rental rates with you before booking — this is an inquiry, not an automatic reservation."
        sections={sections}
        note={{
          strong: 'Availability and rates are confirmed after review.',
          text: 'Vehicle availability, rental duration, and driver preference determine final pricing.',
        }}
        submitLabel="Submit Rental Inquiry"
        successEyebrow="Inquiry received"
        successTitle="Rental Inquiry Received"
        successBody="Our team will confirm vehicle availability, driver options, and rates with you before your rental is booked."
        successButtonLabel="Back to Home"
        onBack={onBack}
        onSuccess={onBack}
      />
    </>
  )
}