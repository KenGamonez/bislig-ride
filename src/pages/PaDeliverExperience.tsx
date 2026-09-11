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
    title: 'What are you sending?',
    hint: 'Package type, size, and weight',
    fields: [
      {
        name: 'package_type',
        label: 'Package Type',
        type: 'select',
        options: ['Documents', 'Parcels', 'Food', 'Clothing', 'Gadgets', 'Other'],
      },
      {
        name: 'package_details',
        label: 'Package Details (Optional)',
        type: 'textarea',
        placeholder: 'Example: sealed envelope, box, fragile items',
        optional: true,
      },
      { name: 'package_size', label: 'Size or Approximate Weight', placeholder: 'Example: Shoe box size' },
    ],
  },
  {
    number: '02',
    title: 'Pickup and delivery',
    hint: 'Where do we pick up and drop off?',
    fields: [
      { name: 'pickup_address', label: 'Pickup Address' },
      { name: 'delivery_address', label: 'Delivery Address' },
      { name: 'preferred_date', label: 'Preferred Date', type: 'date' },
      { name: 'preferred_time', label: 'Preferred Time', type: 'time' },
    ],
  },
  {
    number: '03',
    title: 'Your contact information',
    hint: 'So we can coordinate pickup and drop-off',
    fields: [
      { name: 'sender_name', label: 'Sender Full Name' },
      { name: 'sender_phone', label: 'Contact Number', type: 'tel' },
    ],
  },
]

export function PaDeliverExperience({ onBack }: { onBack: () => void }) {
  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
      <ServiceInquiryForm
        idPrefix="pa-deliver"
        eyebrow="Same-day local delivery"
        title="Pa-deliver"
        titleAccent="/ Padala"
        subtitle="Send documents, parcels, and packages within Bislig City."
        intro="Pa-deliver connects you with a runner who can pick up and drop off your items across Bislig City. A representative will confirm availability and the delivery fee with you before pickup — this is a request, not an automatic confirmation."
        sections={sections}
        note={{
          strong: 'Delivery fee is confirmed after review.',
          text: 'Distance, package size, and urgency will be considered before the fee is confirmed.',
        }}
        submitLabel="Submit Delivery Request"
        successEyebrow="Request received"
        successTitle="Delivery Request Received"
        successBody="Our team will confirm pickup details and the delivery fee with you before the package is booked."
        successButtonLabel="Back to Home"
        onBack={onBack}
        onSuccess={onBack}
      />
    </>
  )
}