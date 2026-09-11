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
    title: 'What are we shopping for?',
    hint: 'Tell us what you need and where to find it',
    fields: [
      {
        name: 'item_category',
        label: 'Item Category',
        type: 'select',
        options: ['Groceries', 'Market / Palengke', 'Pharmacy', 'Appliances', 'Personal items', 'Other'],
      },
      {
        name: 'item_details',
        label: 'Item Details (Optional)',
        type: 'textarea',
        placeholder: 'Example: 2 kilos of rice, bath soap, brand and size if specific',
        optional: true,
      },
    ],
  },
  {
    number: '02',
    title: 'Where and when',
    hint: 'Where should we shop, and where do we deliver?',
    fields: [
      { name: 'pickup_area', label: 'Store or Market Area', placeholder: 'Example: Bislig Public Market' },
      { name: 'delivery_address', label: 'Delivery Address' },
      { name: 'preferred_date', label: 'Preferred Date', type: 'date' },
      { name: 'preferred_time', label: 'Preferred Time', type: 'time' },
    ],
  },
  {
    number: '03',
    title: 'Your contact information',
    hint: 'So our runner can confirm your order',
    fields: [
      { name: 'customer_name', label: 'Full Name' },
      { name: 'customer_phone', label: 'Phone Number', type: 'tel' },
    ],
  },
]

export function PasabuyExperience({ onBack }: { onBack: () => void }) {
  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
      <ServiceInquiryForm
        idPrefix="pasabuy"
        eyebrow="We shop, you receive"
        title="Pasabuy"
        titleAccent="/ Umabot"
        subtitle="Send a buyer to the market, groceries, or any store for you."
        intro="Pasabuy lets you request a trusted runner to buy items on your behalf and deliver them to you. A field representative will confirm item availability and final cost before shopping begins — this is a request, not an automatic confirmation."
        sections={sections}
        note={{
          strong: 'Pricing is confirmed after review.',
          text: 'Item cost, delivery fee, and availability will be confirmed before we shop for you.',
        }}
        submitLabel="Submit Pasabuy Request"
        successEyebrow="Request received"
        successTitle="Pasabuy Request Received"
        successBody="Our team will confirm item availability and pricing with you before your request is finalized."
        successButtonLabel="Back to Home"
        onBack={onBack}
        onSuccess={onBack}
      />
    </>
  )
}