import { useState } from 'react'
import type { FormEvent } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'

export function ContactExperience() {
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="contact-page">
      <header className="app-header contact-header">
        <div className="brand-block">
          <a href="/" aria-label="Bislig Ride home">
            <img
              src={bisligLogo}
              alt="Bislig Ride logo"
              className="brand-logo"
            />
          </a>
        </div>

        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link" href="/pakyawan">Book Pakyawan</a>
          <a className="nav-button" href="/">My Rides</a>
          <a className="nav-button" href="/">Explore Bislig</a>
          <a className="nav-cta" href="/become-a-driver">Become a Driver</a>
          <a className="nav-button active" href="/contact" aria-current="page">Contact</a>
        </nav>
      </header>

      <main className="contact-shell">
        <section className="contact-intro">
          <p className="eyebrow">GET IN TOUCH</p>
          <h1>Let's connect.</h1>
          <p>
            Have a question about Bislig Ride, want to partner with us,
            feature your business, or discuss a digital project? We'd love
            to hear from you.
          </p>
        </section>

        <section className="contact-grid" aria-label="Contact Bislig Ride">
          <div className="contact-info-card">
            <div>
              <p className="contact-card-label">BISLIG RIDE</p>
              <h2>Built for Bislig.</h2>
              <p className="contact-info-copy">
                We're building a local platform that connects passengers,
                drivers, businesses, and the community.
              </p>
            </div>

            <div className="contact-info-list">
              <div className="contact-info-item">
                <span>Location</span>
                <strong>Bislig City, Surigao del Sur</strong>
              </div>

              <div className="contact-info-item">
                <span>For businesses</span>
                <strong>Partnerships &amp; featured listings</strong>
              </div>

              <div className="contact-info-item">
                <span>For projects</span>
                <strong>Websites &amp; digital solutions</strong>
              </div>
            </div>

            <div className="contact-business-note">
              <span className="contact-business-kicker">EXPLORE BISLIG</span>
              <h3>Want your business to be discovered?</h3>
              <p>
                Tell us about your business and how you'd like to be part
                of the growing Explore Bislig experience.
              </p>
            </div>
          </div>

          <div className="contact-form-card">
            {submitted ? (
              <div className="contact-success">
                <span className="contact-success-mark" aria-hidden="true">?</span>
                <p className="eyebrow">MESSAGE RECEIVED</p>
                <h2>Thank you for reaching out.</h2>
                <p>
                  Your message has been received. We'll get back to you as
                  soon as possible.
                </p>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setSubmitted(false)}
                >
                  Send Another Message
                </button>
              </div>
            ) : (
              <form className="contact-form" onSubmit={handleSubmit}>
                <div className="contact-form-heading">
                  <p className="eyebrow">CONTACT US</p>
                  <h2>How can we help?</h2>
                  <p>
                    Send us a message and we'll direct it to the right
                    place.
                  </p>
                </div>

                <label className="contact-field">
                  <span>What can we help you with? <b>*</b></span>
                  <select name="inquiry_type" required defaultValue="General Inquiry">
                    <option>General Inquiry</option>
                    <option>Ride / Rider Support</option>
                    <option>Driver Inquiry</option>
                    <option>Business Partnership</option>
                    <option>Feature My Business</option>
                    <option>Explore Bislig</option>
                    <option>Website / Digital Project</option>
                    <option>Feedback / Suggestion</option>
                    <option>Report a Problem</option>
                    <option>Other</option>
                  </select>
                </label>

                <div className="contact-field-row">
                  <label className="contact-field">
                    <span>Full Name <b>*</b></span>
                    <input
                      type="text"
                      name="full_name"
                      placeholder="Your name"
                      autoComplete="name"
                      required
                    />
                  </label>

                  <label className="contact-field">
                    <span>Phone Number <b>*</b></span>
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
                    <span>Email <small>(optional)</small></span>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </label>

                  <label className="contact-field">
                    <span>Business / Organization <small>(optional)</small></span>
                    <input
                      type="text"
                      name="organization"
                      placeholder="Business or organization"
                      autoComplete="organization"
                    />
                  </label>
                </div>

                <label className="contact-field">
                  <span>Message <b>*</b></span>
                  <textarea
                    name="message"
                    rows={6}
                    placeholder="Tell us how we can help..."
                    required
                  />
                </label>

                <button type="submit" className="primary-action contact-submit">
                  Send Message
                </button>

                <p className="contact-form-note">
                  By submitting this form, you agree that Bislig Ride may
                  use the information you provide to respond to your inquiry.
                </p>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

