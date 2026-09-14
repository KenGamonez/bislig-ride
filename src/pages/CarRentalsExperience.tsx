import { AppHeader, type AppViewMode } from '../components/AppHeader'
import {
  ServiceInquiryForm,
  type ServiceInquirySection,
} from '../components/ServiceInquiryForm'
import { useLanguage } from '../lib/i18n'

const routeToView = (nextView: AppViewMode) => {
  try {
    window.sessionStorage.setItem('bislig-ride-requested-view', nextView)
  } catch {
    // sessionStorage unavailable — the default view will be shown
  }
  window.history.pushState({}, '', '/')
  window.location.reload()
}

export function CarRentalsExperience({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage()

  const sections: ServiceInquirySection[] = [
    {
      number: '01',
      title: t('car.sect1.title'),
      hint: t('car.sect1.hint'),
      fields: [
        {
          name: 'vehicle_type',
          label: t('car.vehicleType'),
          type: 'select',
          options: ['Sedan', 'SUV', 'Van', 'Motorcycle', 'Other'],
        },
        {
          name: 'transmission',
          label: t('car.transmission'),
          type: 'select',
          options: ['Automatic', 'Manual'],
        },
      ],
    },
    {
      number: '02',
      title: t('car.sect2.title'),
      hint: t('car.sect2.hint'),
      fields: [
        { name: 'pickup_date', label: t('car.pickupDate'), type: 'date' },
        { name: 'pickup_time', label: t('car.pickupTime'), type: 'time' },
        { name: 'return_date', label: t('car.returnDate'), type: 'date' },
        {
          name: 'with_driver',
          label: t('car.driverOption'),
          type: 'select',
          options: [t('car.selfDrive'), t('car.withDriver')],
        },
      ],
    },
    {
      number: '03',
      title: t('car.sect3.title'),
      hint: t('car.sect3.hint'),
      fields: [
        { name: 'customer_name', label: t('car.fullName') },
        { name: 'customer_phone', label: t('car.phoneNumber'), type: 'tel' },
      ],
    },
  ]

  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel={t('nav.myRides')} onPrimaryAction={onBack} />
      <ServiceInquiryForm
        idPrefix="car-rentals"
        eyebrow={t('car.eyebrow')}
        title={t('car.title')}
        titleAccent={t('car.titleAccent')}
        subtitle={t('car.subtitle')}
        intro={t('car.intro')}
        sections={sections}
        note={{
          strong: t('car.noteStrong'),
          text: t('car.noteText'),
        }}
        submitLabel={t('car.submit')}
        successEyebrow={t('car.successEyebrow')}
        successTitle={t('car.successTitle')}
        successBody={t('car.successBody')}
        successButtonLabel={t('form.backHome')}
        onBack={onBack}
        onSuccess={onBack}
      />
    </>
  )
}