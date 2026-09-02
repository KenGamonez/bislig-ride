type LocationInputProps = {
  label: string
  value: string
  placeholder: string
  error?: string
  onChange: (value: string) => void
}

export function LocationInput({
  label,
  value,
  placeholder,
  error,
  onChange,
}: LocationInputProps) {
  return (
    <label className="field-block">
      <span className="field-label">{label}</span>
      <input
        className={error ? 'input-field has-error' : 'input-field'}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}
