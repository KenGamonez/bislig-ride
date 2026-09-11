import { useState } from 'react'

export type ServiceInquiryField = {
  name: string
  label: string
  type?: 'text' | 'tel' | 'date' | 'time' | 'number' | 'select' | 'textarea'
  placeholder?: string
  options?: string[]
  optional?: boolean
}

export type ServiceInquirySection = {
  number: string
  title: string
  hint: string
  fields: ServiceInquiryField[]
}

export type ServiceInquiryNote = {
  strong: string
  text: string
}

type ServiceInquiryFormProps = {
  idPrefix: string
  eyebrow: string
  title: string
  titleAccent: string
  subtitle: string
  intro: string
  sections: ServiceInquirySection[]
  note: ServiceInquiryNote
  submitLabel: string
  successEyebrow: string
  successTitle: string
  successBody: string
  successButtonLabel: string
  onBack: () => void
  onSuccess: () => void
}

type FormErrors = Record<string, string>

export function ServiceInquiryForm({
  idPrefix,
  eyebrow,
  title,
  titleAccent,
  subtitle,
  intro,
  sections,
  note,
  submitLabel,
  successEyebrow,
  successTitle,
  successBody,
  successButtonLabel,
  onBack,
  onSuccess,
}: ServiceInquiryFormProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)

  const updateField = (name: string, value: string) => {
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
  }

  const validate = () => {
    const nextErrors: FormErrors = {}

    sections.forEach((section) => {
      section.fields.forEach((field) => {
        const value = (form[field.name] ?? '').trim()

        if (!field.optional && !value) {
          nextErrors[field.name] = 'This field is required.'
          return
        }

        if (value && field.type === 'tel' && !/^[0-9+\-\s()]+$/.test(value)) {
          nextErrors[field.name] = 'Enter a valid phone number.'
        }

        if (value && field.type === 'number' && !/^\d+$/.test(value)) {
          nextErrors[field.name] = 'Enter a valid number.'
        }
      })
    })

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) return
    setSubmitted(true)
  }

  const renderField = (field: ServiceInquiryField) => {
    const value = form[field.name] ?? ''
    const hasError = Boolean(errors[field.name])
    const fieldId = `${idPrefix}-${field.name}`

    if (field.type === 'textarea') {
      return (
        <label className="field-block" key={field.name}>
          <span className="field-label">{field.label}</span>
          <textarea
            id={fieldId}
            className={`input-field textarea-field${hasError ? ' has-error' : ''}`}
            placeholder={field.placeholder}
            value={value}
            onChange={(event) => updateField(field.name, event.target.value)}
          />
          {hasError ? <span className="field-error">{errors[field.name]}</span> : null}
        </label>
      )
    }

    if (field.type === 'select') {
      return (
        <label className="field-block" key={field.name}>
          <span className="field-label">{field.label}</span>
          <select
            id={fieldId}
            className={`input-field${hasError ? ' has-error' : ''}`}
            value={value}
            onChange={(event) => updateField(field.name, event.target.value)}
          >
            <option value="">Select an option</option>
            {(field.options ?? []).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          {hasError ? <span className="field-error">{errors[field.name]}</span> : null}
        </label>
      )
    }

    return (
      <label className="field-block" key={field.name}>
        <span className="field-label">{field.label}</span>
        <input
          id={fieldId}
          className={`input-field${hasError ? ' has-error' : ''}`}
          type={field.type ?? 'text'}
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => updateField(field.name, event.target.value)}
        />
        {hasError ? <span className="field-error">{errors[field.name]}</span> : null}
      </label>
    )
  }

  if (submitted) {
    return (
      <main className="scheduled-shell">
        <section className="scheduled-card scheduled-success">
          <p className="eyebrow">{successEyebrow}</p>
          <h1>{successTitle}</h1>
          <p>{successBody}</p>
          <button type="button" className="primary-action" onClick={onSuccess}>
            {successButtonLabel}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="scheduled-shell">
      <section className="section-header scheduled-header">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title} <span className="hero-accent">{titleAccent}</span></h1>
        <p className="subtitle">{subtitle}</p>
        <p className="scheduled-intro">{intro}</p>
      </section>

      <form className="scheduled-form" onSubmit={handleSubmit} noValidate>
        <button type="button" className="back-link" onClick={onBack}>← Back to Home</button>

        {sections.map((section) => (
          <section className="booking-section" key={section.number}>
            <div className="booking-section-heading">
              <span className="booking-section-number">{section.number}</span>
              <div>
                <strong>{section.title}</strong>
                <span>{section.hint}</span>
              </div>
            </div>
            <div className="form-grid">{section.fields.map(renderField)}</div>
          </section>
        ))}

        <div className="scheduled-pricing-note">
          <strong>{note.strong}</strong>
          <span>{note.text}</span>
        </div>

        <button type="submit" className="primary-action request-ride-action">
          {submitLabel}
        </button>
      </form>
    </main>
  )
}