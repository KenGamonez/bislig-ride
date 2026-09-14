import { useLanguage, type AppLanguage } from '../lib/i18n'

type LanguageToggleProps = {
  className?: string
}

const OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'bi', label: 'BI' },
]

export function LanguageToggle({ className }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage()

  return (
    <div
      className={className ? `language-toggle ${className}` : 'language-toggle'}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={language === option.value ? 'language-option is-active' : 'language-option'}
          aria-pressed={language === option.value}
          onClick={() => setLanguage(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}