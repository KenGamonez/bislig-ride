import { useState } from 'react'
import type { FormEvent } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'
import { createContactMessage } from '../lib/contactMessages'
import type { ContactMessageInsert } from '../types/contactMessage'
import { useLanguage } from '../lib/i18n'

const goHome = () => {
  window.location.href = '/'
}

const goToView = (nextView: AppViewMode) => {
  try {
    window.sessionStorage.setItem('bislig-ride-requested-view', nextView)
  } catch {
    // sessionStorage unavailable — land on the default view
  }
  window.location.href = '/'
}

export function ContactExperience() {
  const { t } = useLanguage()
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError('')
    try {
      const formData = new FormData(event.currentTarget)
      const payload: ContactMessageInsert = {
        inquiry_type: String(formData.get('inquiry_type') ?? ''),
        full_name: String(formData.get('full_name') ?? '').trim(),
        phone: String(formData.get('phone') ?? '').trim(),
        email: String(formData.get('email') ?? '').trim() || null,
        organization: String(formData.get('organization') ?? '').trim() || null,
        message: String(formData.get('message') ?? '').trim(),
      }
      await createContactMessage(payload)
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit contact message:', error)
      setSubmitError(t('contact.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="contact-page">
      <AppHeader
        view="Rider"
        onViewChange={goToView}
        primaryLabel={t('nav.myRides')}
        onPrimaryAction={goHome}
        desktopNavItems={[
          { label: t('nav.bookPakyawan'), href: '/pakyawan', className: 'nav-link nav-link-pakyawan' },
          { label: t('nav.myRides'), href: '/', className: 'nav-button' },
          { label: t('nav.exploreBislig'), href: '/', className: 'nav-button' },
          { label: t('nav.becomeDriver'), href: '/become-a-driver', className: 'nav-cta' },
          { label: t('nav.contact'), href: '/contact', className: 'nav-button active' },
        ]}
      />

      <main className="contact-shell">
        <section className="contact-intro">
          <p className="eyebrow">{t('contact.eyebrow')}</p>
          <h1>{t('contact.title')}</h1>
          <p>{t('contact.intro')}</p>
        </section>

        <section className="contact-grid" aria-label={t('contact.aria')}>
          <div className="contact-info-card">
            <div>
              <p className="contact-card-label">{t('contact.cardLabel')}</p>
              <h2>{t('contact.cardTitle')}</h2>
              <p className="contact-info-copy">{t('contact.infoCopy')}</p>
            </div>

            <div className="contact-info-list">
              <div className="contact-info-item">
                <span>{t('contact.location')}</span>
                <strong>{t('contact.locationValue')}</strong>
              </div>

              <div className="contact-info-item">
                <span>{t('contact.forBusinesses')}</span>
                <strong>{t('contact.businessValue')}</strong>
              </div>

              <div className="contact-info-item">
                <span>{t('contact.forProjects')}</span>
                <strong>{t('contact.projectsValue')}</strong>
              </div>
            </div>

            <div className="contact-business-note">
              <span className="contact-business-kicker">{t('contact.exploreKicker')}</span>
              <h3>{t('contact.exploreTitle')}</h3>
              <p>{t('contact.exploreText')}</p>
              <a className="contact-explore-link" href="/">
                {t('contact.exploreLink')}
              </a>
            </div>
          </div>

          <div className="contact-form-card">
            {submitted ? (
              <div className="contact-success">
                <span className="contact-success-mark" aria-hidden="true">?</span>
                <p className="eyebrow">{t('contact.msgReceived')}</p>
                <h2>{t('contact.thanksTitle')}</h2>
                <p>{t('contact.thanksText')}</p>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setSubmitted(false)}
                >
                  {t('contact.sendAnother')}
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-form-heading">
                  <p className="eyebrow">{t('contact.contactEyebrow')}</p>
                  <h2>{t('contact.helpTitle')}</h2>
                  <p>{t('contact.helpText')}</p>
                </div>

                <label className="contact-field">
                  <span>{t('contact.inquiryField')} <b>*</b></span>
                  <select name="inquiry_type" required defaultValue="General Inquiry">
                    <option value="General Inquiry">{t('contact.inquiryGeneral')}</option>
                    <option value="Ride / Rider Support">{t('contact.inquiryRide')}</option>
                    <option value="Driver Inquiry">{t('contact.inquiryDriver')}</option>
                    <option value="Business Partnership">{t('contact.inquiryPartnership')}</option>
                    <option value="Feature My Business">{t('contact.inquiryFeature')}</option>
                    <option value="Explore Bislig">{t('contact.inquiryExplore')}</option>
                    <option value="Website / Digital Project">{t('contact.inquiryWeb')}</option>
                    <option value="Feedback / Suggestion">{t('contact.inquiryFeedback')}</option>
                    <option value="Report a Problem">{t('contact.inquiryReport')}</option>
                    <option value="Other">{t('contact.inquiryOther')}</option>
                  </select>
                </label>

                <div className="contact-field-row">
                  <label className="contact-field">
                    <span>{t('contact.fullName')} <b>*</b></span>
                    <input
                      type="text"
                      name="full_name"
                      placeholder={t('contact.namePlaceholder')}
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="contact-field">
                    <span>{t('contact.phone')} <b>*</b></span>
                    <input
                      type="tel"
                      name="phone"
                      placeholder="09XX XXX XXXX"
                      autoComplete="tel"
                      required
                    />
                  </label>
                </div>

                <div className="contact-field-row">
                  <label className="contact-field">
                    <span>{t('contact.email')} <small>{t('rating.optional')}</small></span>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>

                  <label className="contact-field">
                    <span>{t('contact.org')} <small>{t('rating.optional')}</small></span>
                    <input
                      type="text"
                      name="organization"
                      placeholder={t('contact.orgPlaceholder')}
                      autoComplete="organization"
                    />
                  </label>
                </div>

                <label className="contact-field">
                  <span>{t('contact.message')} <b>*</b></span>
                  <textarea
                    name="message"
                    rows={6}
                    placeholder={t('contact.messagePlaceholder')}
                    required
                  />
                </label>

                {submitError ? <p className="form-error-message submit-error">{submitError}</p> : null}

                <button type="submit" className="primary-action contact-submit" disabled={isSubmitting}>
                  {isSubmitting ? t('contact.sending') : t('contact.sendMessage')}
                </button>

                <p className="contact-form-note">{t('contact.formNote')}</p>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}